"""Write in-app notifications from request handlers.

Rows go into the same `notifications` outbox the scheduled jobs use, so they
appear in the inbox immediately and the delivery worker fans them out to the
optional email/WhatsApp channels. Every row carries a dedupe key, so retrying a
request (or a double click) never notifies the same person twice.
"""

# Reminder kinds that describe a specific Club Day schedule. When the day is
# rescheduled these become outdated and are marked cancelled.
CLUB_DAY_SCHEDULE_KINDS = (
    "club_day.announced", "club_day.upcoming", "submission.deadline_soon", "club_day.plan_due",
)
EVENT_SCHEDULE_KINDS = ("event.upcoming",)


async def notify_users(conn, user_ids, kind: str, payload: dict, dedupe_prefix: str) -> int:
    """Insert one notification per user; returns how many were new."""
    ids = sorted({int(u) for u in user_ids if u is not None})
    if not ids:
        return 0
    rows = await conn.fetch(
        """INSERT INTO notifications (user_id, kind, payload, dedupe_key)
           SELECT u, $2, $3, $4 || ':' || u::text FROM unnest($1::bigint[]) AS u
           ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
           RETURNING id""",
        ids, kind, payload, dedupe_prefix,
    )
    return len(rows)


async def club_staff_ids(conn, club_id: int) -> list[int]:
    """Coordinators and the faculty advisor of a club."""
    rows = await conn.fetch(
        """SELECT user_id AS id FROM club_coordinators WHERE club_id=$1
           UNION SELECT advisor_id FROM clubs WHERE id=$1 AND advisor_id IS NOT NULL""",
        club_id,
    )
    return [r["id"] for r in rows]


async def club_member_ids(conn, club_id: int) -> list[int]:
    rows = await conn.fetch(
        "SELECT student_id FROM club_memberships WHERE club_id=$1 AND status='approved'", club_id
    )
    return [r["student_id"] for r in rows]


async def cancel_outdated(conn, *, payload_key: str, entity_id: int, kinds: tuple[str, ...]) -> int:
    """Mark reminders about an old schedule as cancelled and stop their pending
    email/WhatsApp deliveries. They stay in history, labelled as outdated."""
    rows = await conn.fetch(
        """UPDATE notifications SET cancelled_at=now()
           WHERE payload->>$1 = $2 AND kind = ANY($3::text[]) AND cancelled_at IS NULL
           RETURNING id""",
        payload_key, str(entity_id), list(kinds),
    )
    ids = [r["id"] for r in rows]
    if ids:
        await conn.execute(
            """UPDATE notification_deliveries SET status='cancelled',
                      last_error_code='superseded_by_reschedule', updated_at=now()
               WHERE notification_id = ANY($1::bigint[]) AND status IN ('pending','sending')""",
            ids,
        )
    return len(ids)
