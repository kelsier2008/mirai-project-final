"""Time-based jobs. Celery tasks are sync, so each one runs a short async
function with its own asyncpg connection.

Scheduled reminders are written to the in-app notification inbox. The unique
dedupe key makes each reminder idempotent across repeated beat runs. Keys for
schedule-specific reminders include the schedule version once a Club Day or
event has been rescheduled, so the new date gets its own reminder while the old
one (marked cancelled at reschedule time) is never repeated.
"""
import asyncio
import json
import logging
import os

import asyncpg

from app.config import settings
from workers.email_delivery import deliver_email
from workers.task_runtime import celery
from workers.whatsapp import deliver_whatsapp

log = logging.getLogger(__name__)
TZ = settings.app_timezone  # institution clock for "today"


def _versioned(prefix: str, day_alias: str = "d") -> str:
    """SQL for a dedupe key: '<prefix>:<id>' plus ':v<n>' after a reschedule.
    Version 1 keeps the original key format so upgrading never re-sends reminders."""
    return (f"'{prefix}:' || {day_alias}.id::text || "
            f"CASE WHEN {day_alias}.schedule_version > 1 THEN ':v' || {day_alias}.schedule_version::text ELSE '' END")


async def _with_conn(fn):
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.set_type_codec("json", schema="pg_catalog", encoder=json.dumps, decoder=json.loads)
        await conn.set_type_codec("jsonb", schema="pg_catalog", encoder=json.dumps, decoder=json.loads)
        return await fn(conn)
    finally:
        await conn.close()


async def _announce(conn) -> int:
    async with conn.transaction():
        days = await conn.fetch(
            """UPDATE club_days d SET status = 'announced'
               FROM clubs c
               WHERE c.id = d.club_id AND c.is_active
                 AND d.status = 'approved'
                 AND d.day_date >= (now() AT TIME ZONE $1)::date
                 AND d.day_date <= (now() AT TIME ZONE $1)::date + 3
               RETURNING d.id, d.club_id""",
            TZ,
        )
        for d in days:
            await conn.execute(
                f"""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
                   SELECT m.student_id, 'club_day.announced',
                          jsonb_build_object('club_day_id', d.id, 'club_id', c.id,
                                             'club_name', c.name, 'day_date', d.day_date,
                                             'start_time', to_char(d.start_time, 'HH24:MI'),
                                             'end_time', to_char(d.end_time, 'HH24:MI'),
                                             'title', d.title, 'deadline', d.submission_deadline,
                                             'topic', p.topic, 'format', p.format,
                                             'deliverable', p.deliverable, 'venue', p.venue),
                          {_versioned('club_day.announced')} || ':' || m.student_id::text
                   FROM club_days d JOIN clubs c ON c.id = d.club_id
                   JOIN club_memberships m ON m.club_id = c.id AND m.status = 'approved'
                   LEFT JOIN activity_plans p ON p.club_day_id = d.id
                   WHERE d.id = $1
                   ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING""",
                d["id"],
            )
            await conn.execute(
                """INSERT INTO audit_log (actor_id, action, entity, entity_id, after_state)
                   VALUES (NULL, 'club_day.auto_announce', 'club_days', $1::text,
                           jsonb_build_object('status', 'announced'))""",
                str(d["id"]),
            )
    return len(days)


@celery.task(name="workers.tasks_schedule.announce_upcoming_club_days")
def announce_upcoming_club_days():
    n = asyncio.run(_with_conn(_announce))
    log.info("announced %s club day(s)", n)
    return n


async def _count_pending(conn) -> int:
    async with conn.transaction():
        rows = await conn.fetch(
            """UPDATE notifications SET sent_at=now()
               WHERE sent_at IS NULL AND send_at <= now() AND cancelled_at IS NULL RETURNING id"""
        )
        return len(rows)


async def _dispatch_due(conn) -> tuple[int, int, int]:
    in_app_count = await _count_pending(conn)
    email_count = await deliver_email(conn)
    whatsapp_count = await deliver_whatsapp(conn)
    return in_app_count, email_count, whatsapp_count


@celery.task(name="workers.tasks_schedule.send_pending_notifications")
def send_pending_notifications():
    """Make due rows available in-app and deliver optional email/WhatsApp copies."""
    in_app_count, email_count, whatsapp_count = asyncio.run(_with_conn(_dispatch_due))
    if in_app_count or email_count or whatsapp_count:
        log.info("notifications delivered in-app: %s; email: %s; WhatsApp: %s",
                 in_app_count, email_count, whatsapp_count)
    return {"in_app": in_app_count, "email": email_count, "whatsapp": whatsapp_count}


async def _remind_plan_7d(conn) -> int:
    async with conn.transaction():
        rows = await conn.fetch(
            f"""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
               SELECT cc.user_id, 'club_day.plan_due',
                      jsonb_build_object('club_day_id', d.id, 'club_id', c.id,
                                         'club_name', c.name, 'day_date', d.day_date,
                                         'title', d.title),
                      {_versioned('club_day.plan_due')} || ':' || cc.user_id::text
               FROM club_days d
               JOIN clubs c ON c.id=d.club_id AND c.is_active
               JOIN club_coordinators cc ON cc.club_id=c.id
               LEFT JOIN activity_plans p ON p.club_day_id=d.id
               WHERE d.status='planned'
                 AND (p.id IS NULL OR p.status IN ('draft','rejected'))
                 AND d.day_date=(now() AT TIME ZONE $1)::date + 7
               ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
               RETURNING id""",
            TZ,
        )
        return len(rows)


@celery.task(name="workers.tasks_schedule.remind_plan_7d")
def remind_plan_7d():
    n = asyncio.run(_with_conn(_remind_plan_7d))
    log.info("queued %s plan reminder(s)", n)
    return n


async def _remind_48h(conn) -> int:
    async with conn.transaction():
        rows = await conn.fetch(
            f"""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
               SELECT m.student_id, 'club_day.upcoming',
                      jsonb_build_object('club_day_id', d.id, 'club_id', c.id,
                                         'club_name', c.name, 'day_date', d.day_date,
                                         'start_time', to_char(d.start_time, 'HH24:MI'),
                                         'end_time', to_char(d.end_time, 'HH24:MI'),
                                         'title', d.title, 'deadline', d.submission_deadline,
                                         'topic', p.topic, 'format', p.format,
                                         'deliverable', p.deliverable, 'venue', p.venue),
                      {_versioned('club_day.upcoming')} || ':' || m.student_id::text
               FROM club_days d
               JOIN clubs c ON c.id=d.club_id AND c.is_active
               JOIN club_memberships m ON m.club_id=c.id AND m.status='approved'
               LEFT JOIN activity_plans p ON p.club_day_id=d.id
               WHERE d.status IN ('announced','approved')
                 AND d.day_date=(now() AT TIME ZONE $1)::date + 2
               ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
               RETURNING id""",
            TZ,
        )
        return len(rows)


@celery.task(name="workers.tasks_schedule.remind_48h")
def remind_48h():
    n = asyncio.run(_with_conn(_remind_48h))
    log.info("queued %s upcoming Club Day reminder(s)", n)
    return n


async def _remind_deadline_5d(conn) -> int:
    async with conn.transaction():
        rows = await conn.fetch(
            f"""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
               SELECT m.student_id, 'submission.deadline_soon',
                      jsonb_build_object('club_day_id', d.id, 'club_id', c.id,
                                         'club_name', c.name, 'title', d.title,
                                         'deadline', d.submission_deadline),
                      {_versioned('submission.deadline_soon')} || ':' || m.student_id::text
               FROM club_days d
               JOIN clubs c ON c.id=d.club_id
               JOIN club_memberships m ON m.club_id=c.id AND m.status='approved'
               WHERE d.status IN ('open','submissions')
                 AND d.submission_deadline IS NOT NULL
                 AND d.submission_deadline > now()
                 AND d.submission_deadline <= now() + interval '5 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM submissions s
                   WHERE s.club_day_id=d.id AND s.student_id=m.student_id
                 )
               ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
               RETURNING id"""
        )
        return len(rows)


@celery.task(name="workers.tasks_schedule.remind_deadline_5d")
def remind_deadline_5d():
    n = asyncio.run(_with_conn(_remind_deadline_5d))
    log.info("queued %s submission deadline reminder(s)", n)
    return n


async def _remind_events_24h(conn) -> int:
    async with conn.transaction():
        rows = await conn.fetch(
            f"""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
               SELECT r.student_id, 'event.upcoming',
                      jsonb_build_object('event_id', e.id, 'title', e.name,
                                         'starts_at', e.starts_at, 'type', e.type),
                      {_versioned('event.upcoming', 'e')} || ':' || r.student_id::text
               FROM events e JOIN registrations r ON r.event_id = e.id
               WHERE e.starts_at > now() AND e.starts_at <= now() + interval '24 hours'
               ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
               RETURNING id"""
        )
        return len(rows)


@celery.task(name="workers.tasks_schedule.remind_events_24h")
def remind_events_24h():
    n = asyncio.run(_with_conn(_remind_events_24h))
    log.info("queued %s event reminder(s)", n)
    return n


async def _monthly_report(conn) -> int:
    async with conn.transaction():
        period_end = await conn.fetchval(
            "SELECT date_trunc('month', now() AT TIME ZONE $1)::date", TZ
        )
        # Beat runs on days 28-31; report only on the final day of the month.
        tomorrow = await conn.fetchval("SELECT (now() AT TIME ZONE $1)::date + 1", TZ)
        if tomorrow.day != 1:
            return 0
        month = period_end.strftime("%Y-%m")
        rows = await conn.fetch(
            """WITH campus_days AS (
                 SELECT c.campus_id, c.id AS club_id, c.name AS club_name, d.id AS day_id,
                        COALESCE(d.title, p.topic, 'Club Day') AS highlight,
                        (SELECT count(*) FROM checkin_sessions cs JOIN attendance a ON a.session_id=cs.id
                         WHERE cs.club_day_id=d.id) AS attendance_records,
                        (SELECT count(DISTINCT a.student_id) FROM checkin_sessions cs JOIN attendance a ON a.session_id=cs.id
                         WHERE cs.club_day_id=d.id) AS unique_attendees,
                        (SELECT count(*) FROM submissions s WHERE s.club_day_id=d.id) AS submissions,
                        (SELECT count(*) FROM club_memberships m WHERE m.club_id=c.id AND m.status='approved') AS members,
                        (SELECT round(avg((SELECT sum(x.value::numeric) FROM jsonb_each_text(e.scores) AS x)), 2)
                         FROM submissions sb JOIN evaluations e ON e.submission_id=sb.id
                         WHERE sb.club_day_id=d.id) AS average_score
                 FROM club_days d JOIN clubs c ON c.id=d.club_id
                 LEFT JOIN activity_plans p ON p.club_day_id=d.id
                 WHERE d.status <> 'planned' AND d.day_date >= $1::date AND d.day_date < $2::date
               ), summaries AS (
                 SELECT campus_id, count(DISTINCT club_id) AS clubs, count(*) AS club_days,
                        sum(attendance_records) AS attendance_records, sum(submissions) AS submissions,
                        sum(unique_attendees) AS unique_attendees, sum(members) AS possible_attendance,
                        round(avg(average_score), 2) AS average_score
                 FROM campus_days GROUP BY campus_id
               )
               SELECT u.id AS user_id, u.campus_id,
                      COALESCE(s.clubs,0) AS clubs, COALESCE(s.club_days,0) AS club_days,
                      COALESCE(s.attendance_records,0) AS attendance_records,
                      COALESCE(s.submissions,0) AS submissions,
                      COALESCE(s.average_score,0)::float8 AS average_score,
                      COALESCE(round(100.0*s.unique_attendees/NULLIF(s.possible_attendance,0),2),0)::float8 AS attendance_percentage,
                      COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM (
                        SELECT club_name, highlight, average_score, submissions FROM campus_days d
                        WHERE d.campus_id=u.campus_id
                        ORDER BY average_score DESC NULLS LAST, submissions DESC, club_name LIMIT 5
                      ) h), '[]'::jsonb) AS highlights
               FROM users u LEFT JOIN summaries s ON s.campus_id=u.campus_id
               WHERE u.role='campus_admin'""",
            period_end, tomorrow,
        )
        made = 0
        for row in rows:
            notification = await conn.fetchval(
                """INSERT INTO notifications (user_id, kind, payload, dedupe_key)
                   VALUES ($1, 'campus.monthly_report', $2,
                           'campus.monthly_report:' || $3::text || ':' || $4::text)
                   ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
                   RETURNING id""",
                row["user_id"],
                {
                    "month": month,
                    "clubs": row["clubs"],
                    "club_days": row["club_days"],
                    "attendance_records": row["attendance_records"],
                    "submissions": row["submissions"],
                    "attendance_percentage": row["attendance_percentage"],
                    "average_score": row["average_score"],
                    "highlights": row["highlights"],
                },
                row["campus_id"], month,
            )
            made += notification is not None
        return made


@celery.task(name="workers.tasks_schedule.monthly_report")
def monthly_report():
    """Notify campus managers when a month has ended."""
    n = asyncio.run(_with_conn(_monthly_report))
    log.info("queued %s monthly report notification(s)", n)
    return n
