import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import settings
from app.core import audit
from app.core.permissions import current_user
from app.db import get_conn

router = APIRouter(prefix="/notifications", tags=["notifications"])


class EmailPreferenceIn(BaseModel):
    enabled: bool


class WhatsAppPreferenceIn(BaseModel):
    phone_e164: str | None = Field(default=None, max_length=16)
    enabled: bool
    consent: bool = False


@router.get("/email-preference")
async def get_email_preference(user: dict = Depends(current_user), conn=Depends(get_conn)):
    enabled = await conn.fetchval("SELECT email_notifications FROM users WHERE id=$1", user["id"])
    return {"enabled": bool(enabled), "available": settings.email_enabled}


@router.put("/email-preference")
async def update_email_preference(body: EmailPreferenceIn, user: dict = Depends(current_user),
                                  conn=Depends(get_conn)):
    async with conn.transaction():
        await conn.execute("UPDATE users SET email_notifications=$2 WHERE id=$1", user["id"], body.enabled)
        await audit.log(conn, actor_id=user["id"], action="notifications.email_preference",
                        entity="users", entity_id=user["id"], after={"enabled": body.enabled})
    return {"enabled": body.enabled, "available": settings.email_enabled}


@router.get("/whatsapp-preference")
async def get_whatsapp_preference(user: dict = Depends(current_user), conn=Depends(get_conn)):
    row = await conn.fetchrow(
        "SELECT phone_e164, opted_in, opted_in_at FROM whatsapp_preferences WHERE user_id=$1",
        user["id"],
    )
    return {
        "enabled": bool(row and row["opted_in"]),
        "phone_last4": row["phone_e164"][-4:] if row and row["phone_e164"] else None,
        "opted_in_at": row["opted_in_at"] if row else None,
    }


@router.put("/whatsapp-preference")
async def update_whatsapp_preference(
    body: WhatsAppPreferenceIn,
    user: dict = Depends(current_user),
    conn=Depends(get_conn),
):
    """Let each user control their own WhatsApp number and opt-in."""
    phone = (body.phone_e164 or "").strip()
    if phone and not re.fullmatch(r"\+[1-9][0-9]{7,14}", phone):
        raise HTTPException(422, "Enter a phone number in international format, such as +14155552671")
    if body.enabled and not body.consent:
        raise HTTPException(422, "Consent is required to enable WhatsApp notifications")

    async with conn.transaction():
        existing = await conn.fetchrow(
            "SELECT phone_e164, opted_in FROM whatsapp_preferences WHERE user_id=$1 FOR UPDATE",
            user["id"],
        )
        if body.enabled and not (phone or (existing and existing["phone_e164"])):
            raise HTTPException(422, "Add your WhatsApp number before enabling notifications")
        if not body.enabled and existing is None:
            return {"enabled": False, "phone_last4": None}
        final_phone = phone or (existing["phone_e164"] if existing else None)
        await conn.execute(
            """INSERT INTO whatsapp_preferences (user_id, phone_e164, opted_in, opted_in_at, opted_out_at)
                VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END,
                        CASE WHEN $3 THEN NULL ELSE now() END)
                ON CONFLICT (user_id) DO UPDATE SET phone_e164=EXCLUDED.phone_e164,
                  opted_in=EXCLUDED.opted_in,
                  opted_in_at=CASE WHEN EXCLUDED.opted_in AND
                                        (NOT whatsapp_preferences.opted_in OR
                                         whatsapp_preferences.phone_e164 IS DISTINCT FROM EXCLUDED.phone_e164)
                                   THEN now() ELSE whatsapp_preferences.opted_in_at END,
                  opted_out_at=CASE WHEN NOT EXCLUDED.opted_in THEN now() ELSE NULL END""",
            user["id"], final_phone, body.enabled,
        )
        action = "notifications.whatsapp_opt_in" if body.enabled else "notifications.whatsapp_opt_out"
        await audit.log(conn, actor_id=user["id"], action=action, entity="whatsapp_preferences",
                        entity_id=user["id"], after={"enabled": body.enabled})
    return {"enabled": body.enabled, "phone_last4": final_phone[-4:] if final_phone else None}


@router.get("")
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(current_user),
    conn=Depends(get_conn),
):
    rows = await conn.fetch(
        """SELECT n.id, n.kind, n.payload, n.send_at, n.sent_at, n.read_at, n.cancelled_at,
                  COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', d.channel, 'status', d.status))
                            FROM notification_deliveries d WHERE d.notification_id=n.id), '[]'::jsonb)
                    AS deliveries
           FROM notifications n
           WHERE n.user_id=$1 AND ($2::boolean = false OR n.read_at IS NULL)
           ORDER BY n.send_at DESC, n.id DESC LIMIT $3""",
        user["id"], unread_only, limit,
    )
    unread = await conn.fetchval(
        "SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL",
        user["id"],
    )
    return {"unread_count": unread, "items": [dict(row) for row in rows]}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    user: dict = Depends(current_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """UPDATE notifications SET read_at=COALESCE(read_at, now())
           WHERE id=$1 AND user_id=$2
           RETURNING id, kind, payload, send_at, sent_at, read_at""",
        notification_id, user["id"],
    )
    if row is None:
        raise HTTPException(404, "Notification not found")
    return dict(row)


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(current_user), conn=Depends(get_conn)):
    result = await conn.execute(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
        user["id"],
    )
    return {"updated": int(result.rsplit(" ", 1)[-1])}
