from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.core.permissions import ADMIN_ROLES, ROLES, require_permission, require_role
from app.core.security import hash_password
from app.core.validation import clean_student_code
from app.db import get_conn

router = APIRouter(tags=["administration"])
USER_ROLES = ROLES


class CampusIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=10, max_length=128)
    role: str
    campus_id: int | None = None
    student_code: str | None = Field(default=None, max_length=80)

    @field_validator("student_code")
    @classmethod
    def valid_student_code(cls, v):
        return clean_student_code(v)


@router.get("/campuses")
async def list_campuses(user: dict = Depends(require_role(*ADMIN_ROLES)), conn=Depends(get_conn)):
    if user["role"] == "super_admin":
        rows = await conn.fetch("SELECT id, name FROM campus ORDER BY name")
    else:
        rows = await conn.fetch(
            "SELECT id, name FROM campus WHERE id=$1", user["campus_id"]
        )
    return [dict(row) for row in rows]


@router.post("/campuses", status_code=201)
async def create_campus(
    body: CampusIn,
    user: dict = Depends(require_permission("campus.create")),
    conn=Depends(get_conn),
):
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(422, "Campus name must contain at least 2 characters")
    try:
        row = await conn.fetchrow(
            "INSERT INTO campus (name) VALUES ($1) RETURNING id, name", name
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "A campus with this name already exists")
    return dict(row)


@router.get("/users")
async def list_users(
    role: str | None = Query(None),
    q: str | None = Query(None, max_length=80),
    user: dict = Depends(require_permission("user.manage")),
    conn=Depends(get_conn),
):
    if role is not None and role not in USER_ROLES:
        raise HTTPException(422, "Unknown role")
    params: list = [role, f"%{q.strip()}%" if q and q.strip() else None]
    where = ["($1::text IS NULL OR u.role=$1)",
             "($2::text IS NULL OR u.name ILIKE $2 OR u.student_code ILIKE $2 OR u.email ILIKE $2)"]
    if user["role"] != "super_admin":
        params.append(user["campus_id"])
        where.append(f"u.campus_id=${len(params)}")
    rows = await conn.fetch(
        f"""SELECT u.id, u.campus_id, ca.name AS campus_name, u.role, u.student_code,
                   u.email, u.name, u.created_at
            FROM users u LEFT JOIN campus ca ON ca.id=u.campus_id
            WHERE {' AND '.join(where)}
            ORDER BY u.campus_id NULLS FIRST, u.role, u.name LIMIT 2000""",
        *params,
    )
    return [dict(row) for row in rows]


@router.post("/users", status_code=201)
async def create_user(
    body: UserIn,
    user: dict = Depends(require_permission("user.manage")),
    conn=Depends(get_conn),
):
    if body.role not in USER_ROLES:
        raise HTTPException(422, "Unknown user role")
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be blank")
    if user["role"] == "campus_admin":
        if body.role in ("campus_admin", "super_admin"):
            raise HTTPException(403, "Campus admins cannot create admin accounts")
        campus_id = user["campus_id"]
    else:
        campus_id = body.campus_id
        if body.role != "super_admin" and campus_id is None:
            raise HTTPException(422, "campus_id is required for this role")
        if body.role == "super_admin":
            campus_id = None

    if campus_id is not None:
        exists = await conn.fetchval("SELECT 1 FROM campus WHERE id=$1", campus_id)
        if not exists:
            raise HTTPException(422, "Campus not found")

    student_code = body.student_code
    if body.role == "student" and not student_code:
        raise HTTPException(422, "student_code is required for students")
    if body.role != "student" and student_code:
        raise HTTPException(422, "student_code is only valid for students")

    try:
        row = await conn.fetchrow(
            """INSERT INTO users (campus_id, role, student_code, email, name, pw_hash)
               VALUES ($1,$2,$3,$4,$5,$6)
               RETURNING id, campus_id, role, student_code, email, name, created_at""",
            campus_id, body.role, student_code, body.email.strip().lower(),
            name, hash_password(body.password),
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(409, "Email or student code is already in use") from exc
    return dict(row)


# ------------------------------------------------------- notification history
@router.get("/admin/notifications")
async def notification_history(
    kind: str | None = Query(None, max_length=80),
    channel: Literal["in_app", "email", "whatsapp"] | None = None,
    status: Literal["pending", "sending", "sent", "failed", "cancelled", "unread", "read"] | None = None,
    club_day_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_permission("notification.history")),
    conn=Depends(get_conn),
):
    """Persisted notification history with per-channel delivery state.

    Super admins see every campus; campus admins see recipients on their campus.
    Recipient contact details (email, phone) and provider responses are never
    returned; failures carry only a stable error code."""
    params: list = []
    where = ["TRUE"]
    if user["role"] != "super_admin":
        params.append(user["campus_id"])
        where.append(f"u.campus_id=${len(params)}")
    if kind:
        params.append(kind)
        where.append(f"n.kind=${len(params)}")
    if club_day_id is not None:
        params.append(str(club_day_id))
        where.append(f"n.payload->>'club_day_id'=${len(params)}")
    if channel in ("email", "whatsapp"):
        params.append(channel)
        ch = f"${len(params)}"
        if status in ("pending", "sending", "sent", "failed", "cancelled"):
            params.append(status)
            where.append(f"EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id=n.id "
                         f"AND d.channel={ch} AND d.status=${len(params)})")
        else:
            where.append(f"EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id=n.id AND d.channel={ch})")
    elif status in ("pending", "sending", "sent", "failed", "cancelled"):
        if status == "cancelled":
            where.append("n.cancelled_at IS NOT NULL")
        elif status == "pending":
            where.append("(n.sent_at IS NULL AND n.cancelled_at IS NULL)")
        elif status == "sent":
            where.append("n.sent_at IS NOT NULL")
        else:
            params.append(status)
            where.append(f"EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id=n.id AND d.status=${len(params)})")
    elif status == "unread":
        where.append("n.read_at IS NULL")
    elif status == "read":
        where.append("n.read_at IS NOT NULL")
    cond = " AND ".join(where)
    total = await conn.fetchval(
        f"SELECT count(*) FROM notifications n JOIN users u ON u.id=n.user_id WHERE {cond}", *params
    )
    params += [limit, offset]
    rows = await conn.fetch(
        f"""SELECT n.id, n.kind, n.payload, n.send_at, n.sent_at, n.read_at, n.cancelled_at,
                   u.id AS recipient_id, u.name AS recipient_name, u.role AS recipient_role,
                   ca.name AS recipient_campus,
                   COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'channel', d.channel, 'status', d.status, 'attempts', d.attempts,
                       'error_code', d.last_error_code, 'sent_at', d.sent_at,
                       'updated_at', d.updated_at) ORDER BY d.channel)
                     FROM notification_deliveries d WHERE d.notification_id=n.id), '[]'::jsonb) AS deliveries
            FROM notifications n
            JOIN users u ON u.id=n.user_id
            LEFT JOIN campus ca ON ca.id=u.campus_id
            WHERE {cond}
            ORDER BY n.send_at DESC, n.id DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}""",
        *params,
    )
    summary_params = params[:-2]
    summary = await conn.fetch(
        f"""SELECT d.channel, d.status, count(*) AS n
            FROM notification_deliveries d
            JOIN notifications n ON n.id=d.notification_id
            JOIN users u ON u.id=n.user_id
            WHERE {cond} GROUP BY d.channel, d.status ORDER BY d.channel, d.status""",
        *summary_params,
    )
    in_app = await conn.fetchrow(
        f"""SELECT count(*) AS total,
                   count(*) FILTER (WHERE n.sent_at IS NOT NULL) AS delivered,
                   count(*) FILTER (WHERE n.read_at IS NOT NULL) AS read,
                   count(*) FILTER (WHERE n.cancelled_at IS NOT NULL) AS cancelled
            FROM notifications n JOIN users u ON u.id=n.user_id WHERE {cond}""",
        *summary_params,
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "in_app": dict(in_app),
        "deliveries": [dict(r) for r in summary],
        "items": [dict(r) for r in rows],
    }
