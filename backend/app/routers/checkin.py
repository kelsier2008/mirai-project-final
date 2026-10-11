"""Check-in: open window, live rotating QR, student scan, attendance, corrections.

QR payload format (what the frontend should encode): CLUBCHK:{session_id}:{token}
"""
import time
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from app import db, redis_client
from app.core import audit
from app.core.permissions import (
    CLUB_MANAGER_ROLES, assert_club_access, assert_club_active, current_user, require_role,
)
from app.core.scoping import club_scope
from app.db import get_conn
from app.services import checkin

router = APIRouter(prefix="/checkin", tags=["checkin"])

VIEW_ROLES = ("coordinator", "advisor", "campus_admin", "super_admin")


class OpenIn(BaseModel):
    duration_minutes: int = Field(default=30, ge=1, le=240)
    late_after_minutes: int = Field(default=10, ge=0, le=240)
    geo_lat: float | None = None
    geo_lng: float | None = None
    geo_radius_m: int | None = Field(default=None, ge=10)

    @model_validator(mode="after")
    def geo_all_or_none(self):
        geo = (self.geo_lat, self.geo_lng, self.geo_radius_m)
        if any(v is not None for v in geo) and not all(v is not None for v in geo):
            raise ValueError("geo_lat, geo_lng and geo_radius_m must be given together")
        return self


class ScanIn(BaseModel):
    session_id: int
    token: str
    lat: float | None = None  # optional, used only for the geo flag
    lng: float | None = None


class CorrectionIn(BaseModel):
    student_id: int
    action: Literal["add", "remove"]
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_required(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("A reason of at least 5 characters is required")
        return v


# ------------------------------------------------------------- session history
_SESSION_SELECT = """
    SELECT s.id, s.club_day_id, d.club_id, c.name AS club_name, d.title AS club_day_title,
           d.day_date, d.start_time, d.end_time, d.status AS club_day_status,
           s.opens_at, s.closes_at, s.late_after,
           s.geo_lat IS NOT NULL AS geo_required, s.geo_radius_m,
           CASE WHEN now() < s.opens_at THEN 'scheduled'
                WHEN now() <= s.closes_at THEN 'live' ELSE 'closed' END AS status,
           (SELECT count(*) FROM attendance a WHERE a.session_id = s.id) AS checked_in,
           (SELECT count(*) FROM attendance a WHERE a.session_id = s.id AND a.is_late) AS late,
           (SELECT count(*) FROM attendance a WHERE a.session_id = s.id AND a.geo_flag) AS geo_flagged,
           (SELECT count(*) FROM attendance a WHERE a.session_id = s.id AND a.corrected) AS corrected,
           (SELECT count(*) FROM club_memberships m
              WHERE m.club_id = d.club_id AND m.status = 'approved') AS eligible_members,
           uo.name AS opened_by_name, uc.name AS closed_by_name
    FROM checkin_sessions s
    JOIN club_days d ON d.id = s.club_day_id
    JOIN clubs c ON c.id = d.club_id
    LEFT JOIN users uo ON uo.id = s.opened_by
    LEFT JOIN users uc ON uc.id = s.closed_by
"""


async def _session_detail(conn, session_id: int) -> dict:
    row = await conn.fetchrow(_SESSION_SELECT + " WHERE s.id = $1", session_id)
    if row is None:
        raise HTTPException(404, "Session not found")
    return dict(row)


@router.get("/sessions")
async def session_history(
    club_day_id: int | None = None,
    club_id: int | None = None,
    status: Literal["live", "closed", "scheduled"] | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_role(*VIEW_ROLES)),
    conn=Depends(get_conn),
):
    """Check-in sessions the caller may see, newest first. The database is the
    source of truth, so the live screen can be restored after a page refresh."""
    frag, val = club_scope(user)
    params: list = [val]
    where = [frag]
    if club_day_id is not None:
        params.append(club_day_id)
        where.append(f"s.club_day_id = ${len(params)}")
    if club_id is not None:
        params.append(club_id)
        where.append(f"d.club_id = ${len(params)}")
    if status == "live":
        where.append("now() BETWEEN s.opens_at AND s.closes_at")
    elif status == "closed":
        where.append("now() > s.closes_at")
    elif status == "scheduled":
        where.append("now() < s.opens_at")
    cond = " AND ".join(where)
    total = await conn.fetchval(
        f"""SELECT count(*) FROM checkin_sessions s JOIN club_days d ON d.id = s.club_day_id
            JOIN clubs c ON c.id = d.club_id WHERE {cond}""", *params)
    params += [limit, offset]
    rows = await conn.fetch(
        _SESSION_SELECT + f" WHERE {cond} ORDER BY s.opens_at DESC, s.id DESC"
        f" LIMIT ${len(params) - 1} OFFSET ${len(params)}",
        *params,
    )
    return {"total": total, "items": [dict(r) for r in rows]}


@router.get("/sessions/{session_id}")
async def session_detail(
    session_id: int, user: dict = Depends(current_user), conn=Depends(get_conn)
):
    """Staff get the full summary. A student gets the session's club, day and
    window plus their own check-in state (never the token secret)."""
    out = await _session_detail(conn, session_id)
    if user["role"] == "student":
        member = await conn.fetchval(
            """SELECT 1 FROM club_memberships
               WHERE student_id=$1 AND club_id=$2 AND status='approved'""",
            user["id"], out["club_id"],
        )
        if not member:
            raise HTTPException(404, "Session not found")
        mine = await conn.fetchrow(
            """SELECT id, checked_in_at, is_late, geo_flag, corrected FROM attendance
               WHERE session_id=$1 AND student_id=$2""",
            session_id, user["id"],
        )
        keep = ("id", "club_day_id", "club_id", "club_name", "club_day_title", "day_date",
                "start_time", "end_time", "opens_at", "closes_at", "late_after", "status",
                "geo_required")
        student_out = {k: out[k] for k in keep}
        student_out["my_checkin"] = dict(mine) if mine else None
        return student_out
    await assert_club_access(conn, user, out["club_id"], allow=VIEW_ROLES)
    return out


# ---------------------------------------------------------------- coordinator
@router.post("/club-days/{club_day_id}/open", status_code=201)
async def open_window(
    club_day_id: int,
    body: OpenIn,
    user: dict = Depends(require_role(*CLUB_MANAGER_ROLES)),
    conn=Depends(get_conn),
):
    async with conn.transaction():
        day = await conn.fetchrow(
            "SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id
        )
        if day is None:
            raise HTTPException(404, "Club day not found")
        club = await assert_club_access(conn, user, day["club_id"])
        assert_club_active(club, "Opening a check-in window")
        if day["status"] != "open":
            raise HTTPException(409, "Club day must be in 'open' status to start check-in")
        active = await conn.fetchval(
            "SELECT 1 FROM checkin_sessions WHERE club_day_id=$1 AND closes_at > now()",
            club_day_id,
        )
        if active:
            raise HTTPException(409, "A check-in window is already open for this club day")

        import secrets
        row = await conn.fetchrow(
            """INSERT INTO checkin_sessions
                 (club_day_id, secret, opens_at, closes_at, late_after,
                  geo_lat, geo_lng, geo_radius_m, opened_by)
               VALUES ($1, $2, now(),
                       now() + make_interval(mins => $3::int),
                       now() + make_interval(mins => $4::int),
                       $5, $6, $7, $8)
               RETURNING *""",
            club_day_id, secrets.token_hex(32),
            body.duration_minutes, body.late_after_minutes,
            body.geo_lat, body.geo_lng, body.geo_radius_m, user["id"],
        )
    await checkin.cache_session(row, day["club_id"])
    # NEVER return the secret
    return await _session_detail(conn, row["id"])


@router.get("/sessions/{session_id}/qr")
async def current_qr(
    session_id: int,
    user: dict = Depends(require_role(*CLUB_MANAGER_ROLES)),
    conn=Depends(get_conn),
):
    """Frontend polls this (or uses expires_in) to refresh the QR on the projector."""
    sess = await checkin.load_session(session_id)
    if sess is None:
        raise HTTPException(404, "Session not found")
    await assert_club_access(conn, user, sess["club_id"])
    now = time.time()
    if now > sess["closes_at"]:
        raise HTTPException(409, "This check-in window is closed")
    token = checkin.make_token(sess["secret"], sess["id"], checkin.current_step(now))
    return {
        "session_id": sess["id"],
        "token": token,
        "payload": f"CLUBCHK:{sess['id']}:{token}",
        "expires_in": checkin.seconds_left_in_step(now),
        "step_seconds": checkin.STEP_SECONDS,
    }


@router.post("/sessions/{session_id}/close")
async def close_window(
    session_id: int,
    user: dict = Depends(require_role(*CLUB_MANAGER_ROLES)),
    conn=Depends(get_conn),
):
    sess = await checkin.load_session(session_id)
    if sess is None:
        raise HTTPException(404, "Session not found")
    await assert_club_access(conn, user, sess["club_id"])
    await conn.execute(
        "UPDATE checkin_sessions SET closes_at = now(), closed_by = $2 WHERE id=$1 AND closes_at > now()",
        session_id, user["id"],
    )
    await checkin.invalidate_session(session_id)
    return {"closed": True, "session": await _session_detail(conn, session_id)}


@router.get("/sessions/{session_id}/attendance")
async def session_attendance(
    session_id: int,
    user: dict = Depends(require_role(*VIEW_ROLES)),
    conn=Depends(get_conn),
):
    sess = await checkin.load_session(session_id)
    if sess is None:
        raise HTTPException(404, "Session not found")
    await assert_club_access(conn, user, sess["club_id"], allow=VIEW_ROLES)
    rows = await conn.fetch(
        """SELECT a.*, u.name AS student_name, u.student_code
           FROM attendance a JOIN users u ON u.id = a.student_id
           WHERE a.session_id=$1 ORDER BY a.checked_in_at""",
        session_id,
    )
    return [dict(r) for r in rows]


@router.get("/sessions/{session_id}/roster")
async def session_roster(
    session_id: int,
    user: dict = Depends(require_role(*VIEW_ROLES)),
    conn=Depends(get_conn),
):
    """Every approved member of the club with their state for this session:
    checked_in (with late/geo/corrected flags) or not_checked_in."""
    sess = await _session_detail(conn, session_id)
    await assert_club_access(conn, user, sess["club_id"], allow=VIEW_ROLES)
    rows = await conn.fetch(
        """SELECT u.id AS student_id, u.name AS student_name, u.student_code,
                  a.id AS attendance_id, a.checked_in_at, a.is_late, a.geo_flag,
                  a.corrected, a.correction_reason,
                  CASE WHEN a.id IS NULL THEN 'not_checked_in' ELSE 'checked_in' END AS state
           FROM club_memberships m
           JOIN users u ON u.id = m.student_id
           LEFT JOIN attendance a ON a.session_id = $1 AND a.student_id = m.student_id
           WHERE m.club_id = $2 AND m.status = 'approved'
           UNION ALL
           -- attendance kept for students who have since left the club
           SELECT u.id, u.name, u.student_code, a.id, a.checked_in_at, a.is_late, a.geo_flag,
                  a.corrected, a.correction_reason, 'checked_in'
           FROM attendance a JOIN users u ON u.id = a.student_id
           WHERE a.session_id = $1 AND NOT EXISTS (
             SELECT 1 FROM club_memberships m WHERE m.club_id = $2
               AND m.student_id = a.student_id AND m.status = 'approved')
           ORDER BY 10, 2""",
        session_id, sess["club_id"],
    )
    return {"session": sess, "students": [dict(r) for r in rows]}


@router.post("/sessions/{session_id}/corrections")
async def correct_attendance(
    session_id: int,
    body: CorrectionIn,
    user: dict = Depends(require_role(*CLUB_MANAGER_ROLES)),
    conn=Depends(get_conn),
):
    """Manual add/remove. A reason is mandatory and the change is audit-logged
    (the audit table also has a CHECK constraint enforcing a reason)."""
    sess = await checkin.load_session(session_id)
    if sess is None:
        raise HTTPException(404, "Session not found")
    await assert_club_access(conn, user, sess["club_id"])

    async with conn.transaction():
        existing = await conn.fetchrow(
            """SELECT * FROM attendance WHERE student_id=$1 AND session_id=$2 FOR UPDATE""",
            body.student_id, session_id,
        )
        if body.action == "add":
            member = await conn.fetchval(
                """SELECT 1 FROM club_memberships
                   WHERE student_id=$1 AND club_id=$2 AND status='approved'""",
                body.student_id, sess["club_id"],
            )
            if not member:
                raise HTTPException(422, "Student is not an approved member of this club")
            if existing:
                raise HTTPException(409, "Student already has attendance for this session")
            row = await conn.fetchrow(
                """INSERT INTO attendance
                     (student_id, session_id, is_late, geo_flag, corrected, correction_reason)
                   VALUES ($1, $2, false, false, true, $3) RETURNING *""",
                body.student_id, session_id, body.reason,
            )
            before, after = None, dict(row)
        else:
            if not existing:
                raise HTTPException(404, "No attendance record to remove")
            await conn.execute("DELETE FROM attendance WHERE id=$1", existing["id"])
            before, after = dict(existing), None

        await audit.log(
            conn, actor_id=user["id"], action="attendance.correct",
            entity="attendance", entity_id=f"{session_id}:{body.student_id}",
            before=before, after=after, reason=body.reason,
        )

    if body.action == "remove":
        # PostgreSQL is the source of truth: free the cache guard so the DB state
        # and the fast-path state agree.
        await redis_client.redis.delete(checkin.done_key(session_id, body.student_id))
    return {"ok": True, "action": body.action}


# ------------------------------------------------------------------- student
@router.post("/scan", status_code=201)
async def scan(body: ScanIn, user: dict = Depends(require_role("student"))):
    """HOT PATH. Cache read -> HMAC check -> atomic cache SET NX -> one DB insert.
    We deliberately do NOT use Depends(get_conn): a pooled connection is only
    taken at the very end, for the single INSERT."""
    r = redis_client.redis

    sess = await checkin.load_session(body.session_id)
    if sess is None:
        raise HTTPException(404, "Session not found")

    now = time.time()
    if not (sess["opens_at"] <= now <= sess["closes_at"]):
        raise HTTPException(409, "Check-in window is not open")

    if not checkin.token_valid(sess["secret"], sess["id"], body.token, now):
        raise HTTPException(403, "QR code expired or invalid. Scan the live code again.")

    # Fast duplicate guard (the DB UNIQUE constraint is the real one)
    key = checkin.done_key(sess["id"], user["id"])
    ttl = int(sess["closes_at"] - now) + 60
    if not await r.set(key, 1, nx=True, ex=ttl):
        raise HTTPException(409, "You have already checked in")

    is_late = now > sess["late_after"]
    geo_flag = False
    if sess["geo_lat"] is not None:
        if body.lat is None or body.lng is None:
            geo_flag = True  # flagged, never blocked: GPS is unreliable
        else:
            dist = checkin.distance_m(sess["geo_lat"], sess["geo_lng"], body.lat, body.lng)
            geo_flag = dist > sess["geo_radius_m"]

    try:
        async with db.pool.acquire() as conn:
            # Membership check lives inside the INSERT: one round trip, no extra query.
            row = await conn.fetchrow(
                """INSERT INTO attendance (student_id, session_id, is_late, geo_flag)
                   SELECT $1::bigint, $2::bigint, $3::boolean, $4::boolean
                   WHERE EXISTS (SELECT 1 FROM club_memberships
                                 WHERE student_id = $1::bigint
                                   AND club_id = $5::int
                                   AND status = 'approved')
                   RETURNING id, checked_in_at, is_late, geo_flag""",
                user["id"], sess["id"], is_late, geo_flag, sess["club_id"],
            )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "You have already checked in")
    except Exception:
        await r.delete(key)  # let the student retry after a transient failure
        raise

    if row is None:
        await r.delete(key)
        raise HTTPException(403, "You are not an approved member of this club")

    return {
        "attendance_id": row["id"],
        "checked_in_at": row["checked_in_at"],
        "is_late": row["is_late"],
        "geo_flag": row["geo_flag"],
    }


@router.get("/attendance/me")
async def my_attendance(
    user: dict = Depends(require_role("student")), conn=Depends(get_conn)
):
    rows = await conn.fetch(
        """SELECT a.id, a.session_id, a.checked_in_at, a.is_late, a.geo_flag, a.corrected,
                  d.id AS club_day_id, d.day_date, d.start_time, d.title, c.name AS club_name
           FROM attendance a
           JOIN checkin_sessions s ON s.id = a.session_id
           JOIN club_days d ON d.id = s.club_day_id
           JOIN clubs c ON c.id = d.club_id
           WHERE a.student_id=$1 ORDER BY a.checked_in_at DESC""",
        user["id"],
    )
    return [dict(r) for r in rows]
