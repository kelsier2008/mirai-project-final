"""Optional email delivery for in-app notifications.

Enabled only when SMTP_HOST and SMTP_FROM are configured. Each notification
gets one row in notification_deliveries (channel='email') whose status moves
pending -> sending -> sent | failed. "sent" means the SMTP server accepted the
message; bounces after that are not visible to this worker. Failures record a
stable error code only: no addresses, credentials or server responses are
stored or logged.
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger(__name__)

EMAIL_KINDS = {
    "club_day.announced", "club_day.upcoming", "club_day.rescheduled", "club_day.plan_due",
    "club_day.plan_submitted", "club_day.plan_approved", "club_day.plan_rejected",
    "submission.deadline_soon", "submission.resubmission_requested",
    "event.rescheduled", "event.upcoming", "budget.approved", "budget.rejected",
    "campus.monthly_report",
}
MAX_ATTEMPTS = 5
BATCH_SIZE = 25
# Only fan out recent notifications, so enabling email later does not send
# the whole inbox history at once.
FANOUT_WINDOW = "1 day"

SUBJECTS = {
    "club_day.announced": "Club Day announced",
    "club_day.upcoming": "Reminder: Club Day in two days",
    "club_day.rescheduled": "Club Day rescheduled",
    "club_day.plan_due": "Club Day plan due",
    "club_day.plan_submitted": "Club Day plan submitted for approval",
    "club_day.plan_approved": "Club Day plan approved",
    "club_day.plan_rejected": "Club Day plan needs changes",
    "submission.deadline_soon": "Submission deadline approaching",
    "submission.resubmission_requested": "Please resubmit your work",
    "event.rescheduled": "Event rescheduled",
    "event.upcoming": "Reminder: event starts soon",
    "budget.approved": "Budget request approved",
    "budget.rejected": "Budget request rejected",
    "campus.monthly_report": "Monthly campus report",
}


def email_config() -> dict | None:
    if not settings.email_enabled:
        return None
    return {
        "host": settings.smtp_host.strip(),
        "port": settings.smtp_port,
        "username": settings.smtp_username,
        "password": settings.smtp_password,
        "sender": settings.smtp_from.strip(),
        "security": settings.smtp_security,
    }


def render_message(kind: str, payload: dict, app_name: str) -> tuple[str, str]:
    """Return (subject, plain-text body). Only fields from the notification payload."""
    subject = f"{app_name}: {SUBJECTS.get(kind, 'Update')}"
    lines = []
    labels = (
        ("club_name", "Club"), ("title", "Activity"), ("day_date", "Date"),
        ("previous_day_date", "Previously"), ("start_time", "Starts"), ("end_time", "Ends"),
        ("starts_at", "Starts"), ("previous_starts_at", "Previously"), ("deadline", "Deadline"),
        ("topic", "Topic"), ("venue", "Venue"), ("amount", "Amount"), ("decided_by_name", "Decided by"),
        ("reason", "Reason"), ("comment", "Feedback"), ("month", "Month"),
    )
    for key, label in labels:
        value = payload.get(key)
        if value not in (None, ""):
            if key == "amount" and payload.get("currency"):
                value = f"{payload['currency']} {value}"
            lines.append(f"{label}: {value}")
    body = "\n".join([SUBJECTS.get(kind, "Update") + ".", "", *lines, "",
                      f"Open {app_name} to see the details.",
                      "You receive this because email notifications are on for your account."])
    return subject, body


def _send_sync(config: dict, to_addr: str, subject: str, body: str) -> str | None:
    """Send one message. Returns None on success or a stable error code."""
    msg = EmailMessage()
    msg["From"] = config["sender"]
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        if config["security"] == "ssl":
            server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=20,
                                      context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(config["host"], config["port"], timeout=20)
        with server:
            if config["security"] == "starttls":
                server.starttls(context=ssl.create_default_context())
            if config["username"]:
                server.login(config["username"], config["password"])
            refused = server.send_message(msg)
            if refused:
                return "smtp_recipient_refused"
        return None
    except smtplib.SMTPAuthenticationError:
        return "smtp_auth_failed"
    except smtplib.SMTPRecipientsRefused:
        return "smtp_recipient_refused"
    except smtplib.SMTPSenderRefused:
        return "smtp_sender_refused"
    except smtplib.SMTPResponseException as exc:
        return f"smtp_{exc.smtp_code}"
    except (TimeoutError, smtplib.SMTPServerDisconnected):
        return "smtp_timeout"
    except (OSError, smtplib.SMTPException):
        return "smtp_connect_error"


def is_permanent(code: str) -> bool:
    return code in ("smtp_auth_failed", "smtp_recipient_refused", "smtp_sender_refused") or (
        code.startswith("smtp_5"))


async def _claim_batch(conn) -> list[dict]:
    async with conn.transaction():
        await conn.execute(
            """UPDATE notification_deliveries SET status='pending', updated_at=now()
               WHERE channel='email' AND status='sending' AND updated_at < now() - interval '5 minutes'"""
        )
        await conn.execute(
            f"""INSERT INTO notification_deliveries (notification_id, channel)
                SELECT n.id, 'email' FROM notifications n JOIN users u ON u.id=n.user_id
                WHERE n.sent_at IS NOT NULL AND n.cancelled_at IS NULL
                  AND n.send_at >= now() - interval '{FANOUT_WINDOW}'
                  AND n.kind = ANY($1::text[]) AND u.email_notifications
                ON CONFLICT (notification_id, channel) DO NOTHING""",
            list(EMAIL_KINDS),
        )
        rows = await conn.fetch(
            """WITH picked AS (
                 SELECT d.id FROM notification_deliveries d
                 WHERE d.channel='email' AND d.status='pending' AND d.next_attempt_at <= now()
                 ORDER BY d.next_attempt_at, d.id LIMIT $1
                 FOR UPDATE OF d SKIP LOCKED)
               UPDATE notification_deliveries d SET status='sending', attempts=d.attempts+1, updated_at=now()
               FROM picked WHERE d.id=picked.id
               RETURNING d.id""",
            BATCH_SIZE,
        )
        if not rows:
            return []
        details = await conn.fetch(
            """SELECT d.id, d.attempts, n.kind, n.payload, n.cancelled_at, u.email,
                      u.email_notifications
               FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id
               JOIN users u ON u.id=n.user_id WHERE d.id = ANY($1::bigint[])""",
            [r["id"] for r in rows],
        )
        return [dict(r) for r in details]


async def deliver_email(conn) -> int:
    config = email_config()
    if not config:
        return 0
    rows = await _claim_batch(conn)
    sent = 0
    for row in rows:
        if row["cancelled_at"] is not None:
            await conn.execute(
                """UPDATE notification_deliveries SET status='cancelled',
                   last_error_code='superseded_by_reschedule', updated_at=now() WHERE id=$1""", row["id"])
            continue
        if not row["email_notifications"]:
            await conn.execute(
                """UPDATE notification_deliveries SET status='cancelled',
                   last_error_code='user_opted_out', updated_at=now() WHERE id=$1""", row["id"])
            continue
        subject, body = render_message(row["kind"], row["payload"] or {}, settings.app_name)
        code = await asyncio.to_thread(_send_sync, config, row["email"], subject, body)
        if code is None:
            await conn.execute(
                """UPDATE notification_deliveries SET status='sent', sent_at=now(),
                   last_error_code=NULL, updated_at=now() WHERE id=$1""", row["id"])
            sent += 1
            continue
        terminal = row["attempts"] >= MAX_ATTEMPTS or is_permanent(code)
        delay = min(60 * (2 ** max(row["attempts"] - 1, 0)), 21600)
        await conn.execute(
            """UPDATE notification_deliveries SET status=$2,
               next_attempt_at=now() + ($3::int * interval '1 second'),
               last_error_code=$4, updated_at=now() WHERE id=$1""",
            row["id"], "failed" if terminal else "pending", delay, code[:80],
        )
        log.warning("email delivery %s failed (%s), attempt %s", row["id"], code, row["attempts"])
    return sent
