import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.core import audit
from app.core.permissions import (
    ADMIN_ROLES, assert_club_access, current_user, require_permission,
)
from app.core.state_machines import CLUB_APPROVAL, transition
from app.db import get_conn

router = APIRouter(prefix="/clubs", tags=["clubs"])


class ClubIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    capacity: int = Field(gt=0)
    campus_id: int | None = None  # only used by super_admin
    advisor_id: int | None = None
    rules: dict = Field(default_factory=dict)


class ClubUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    capacity: int | None = Field(default=None, gt=0)
    advisor_id: int | None = None
    rules: dict | None = None


class CoordinatorIn(BaseModel):
    user_id: int


class ClubDecisionIn(BaseModel):
    # "reject" on an approved club unapproves it; "approve" on a rejected club restores it.
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=500)


class ClubStatusIn(BaseModel):
    active: bool
    reason: str | None = Field(default=None, max_length=500)


# Every list/detail response carries the decision trail with readable names.
_CLUB_SELECT = """
    SELECT c.*,
      (SELECT count(*) FROM club_memberships m
         WHERE m.club_id=c.id AND m.status='approved') AS approved_count,
      (SELECT count(*) FROM club_memberships m
         WHERE m.club_id=c.id AND m.status='pending') AS pending_count,
      ca.name AS campus_name,
      adv.name AS advisor_name,
      ap.name AS approved_by_name,
      cr.name AS created_by_name,
      de.name AS deactivated_by_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name)
                FROM club_coordinators cc JOIN users u ON u.id=cc.user_id
                WHERE cc.club_id=c.id), '[]'::jsonb) AS coordinators
    FROM clubs c
    JOIN campus ca ON ca.id=c.campus_id
    LEFT JOIN users adv ON adv.id=c.advisor_id
    LEFT JOIN users ap ON ap.id=c.approved_by
    LEFT JOIN users cr ON cr.id=c.created_by
    LEFT JOIN users de ON de.id=c.deactivated_by
"""


def _student_view(row) -> dict:
    """Students see the registry entry, not the staff decision trail."""
    keep = ("id", "campus_id", "campus_name", "name", "description", "capacity",
            "approved_count", "advisor_name", "rules", "approval_status", "is_active")
    return {k: row[k] for k in keep}


async def _club_out(conn, club_id: int) -> dict:
    row = await conn.fetchrow(_CLUB_SELECT + " WHERE c.id=$1", club_id)
    return dict(row)


@router.post("", status_code=201)
async def create_club(
    body: ClubIn,
    user: dict = Depends(require_permission("club.create")),
    conn=Depends(get_conn),
):
    campus_id = body.campus_id if user["role"] == "super_admin" else user["campus_id"]
    if campus_id is None:
        raise HTTPException(422, "campus_id is required")
    if len(body.name.strip()) == 0:
        raise HTTPException(422, "Club name cannot be blank")
    if not await conn.fetchval("SELECT 1 FROM campus WHERE id=$1", campus_id):
        raise HTTPException(422, "Campus not found")
    if body.advisor_id is not None:
        await _validate_advisor(conn, body.advisor_id, campus_id)
    try:
        async with conn.transaction():
            # Clubs proposed by the program office (super admin) wait for the campus
            # to approve them; a campus admin's own clubs are approved on creation.
            approval_status = "pending" if user["role"] == "super_admin" else "approved"
            row = await conn.fetchrow(
                """INSERT INTO clubs (campus_id, name, description, capacity, advisor_id, rules,
                                      approval_status, approved_by, approved_at, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7::text,
                           CASE WHEN $7::text='approved' THEN $8::bigint END,
                           CASE WHEN $7::text='approved' THEN now() END,$8::bigint) RETURNING id""",
                campus_id, body.name.strip(), body.description.strip(), body.capacity,
                body.advisor_id, body.rules, approval_status, user["id"],
            )
            await audit.log(conn, actor_id=user["id"], action="club.create", entity="clubs",
                            entity_id=row["id"],
                            after={"name": body.name.strip(), "approval_status": approval_status})
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "A club with this name already exists on that campus")
    return await _club_out(conn, row["id"])


async def _validate_advisor(conn, advisor_id: int | None, campus_id: int):
    if advisor_id is None:
        return
    target = await conn.fetchrow(
        "SELECT role, campus_id FROM users WHERE id=$1", advisor_id
    )
    if target is None or target["role"] != "advisor" or target["campus_id"] != campus_id:
        raise HTTPException(422, "Advisor must be an advisor on the club's campus")


@router.get("")
async def list_clubs(user: dict = Depends(current_user), conn=Depends(get_conn)):
    """Row-level scoping by role."""
    role = user["role"]
    if role == "super_admin":
        rows = await conn.fetch(_CLUB_SELECT + " ORDER BY c.id")
    elif role == "student":
        rows = await conn.fetch(
            _CLUB_SELECT + """ WHERE c.campus_id=$1 AND c.approval_status='approved'
                               AND c.is_active ORDER BY c.id""",
            user["campus_id"],
        )
        return [_student_view(r) for r in rows]
    elif role == "campus_admin":
        rows = await conn.fetch(_CLUB_SELECT + " WHERE c.campus_id=$1 ORDER BY c.id", user["campus_id"])
    elif role == "coordinator":
        rows = await conn.fetch(
            _CLUB_SELECT + " WHERE c.id IN (SELECT club_id FROM club_coordinators WHERE user_id=$1) ORDER BY c.id",
            user["id"],
        )
    else:  # advisor
        rows = await conn.fetch(_CLUB_SELECT + " WHERE c.advisor_id=$1 ORDER BY c.id", user["id"])
    return [dict(r) for r in rows]


@router.get("/{club_id}")
async def get_club(club_id: int, user: dict = Depends(current_user), conn=Depends(get_conn)):
    club = await conn.fetchrow(_CLUB_SELECT + " WHERE c.id=$1", club_id)
    if club is None:
        raise HTTPException(404, "Club not found")
    if user["role"] != "super_admin" and club["campus_id"] != user["campus_id"]:
        raise HTTPException(404, "Club not found")
    if user["role"] == "student":
        if club["approval_status"] != "approved" or not club["is_active"]:
            raise HTTPException(404, "Club not found")
        return _student_view(club)
    out = dict(club)
    history = await conn.fetch(
        """SELECT a.action, a.before_state, a.after_state, a.reason, a.at, u.name AS actor_name
           FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
           WHERE a.entity='clubs' AND a.entity_id=$1 ORDER BY a.at DESC LIMIT 20""",
        str(club_id),
    )
    out["history"] = [dict(r) for r in history]
    out["club_days"] = await conn.fetchval("SELECT count(*) FROM club_days WHERE club_id=$1", club_id)
    return out


@router.post("/{club_id}/decision")
async def decide_club(club_id: int, body: ClubDecisionIn,
                      user: dict = Depends(require_permission("club.approve")), conn=Depends(get_conn)):
    reason = (body.reason or "").strip() or None
    async with conn.transaction():
        club = await conn.fetchrow("SELECT * FROM clubs WHERE id=$1 FOR UPDATE", club_id)
        if club is None or (user["role"] != "super_admin" and club["campus_id"] != user["campus_id"]):
            raise HTTPException(404, "Club not found")
        target = "approved" if body.decision == "approve" else "rejected"
        if club["approval_status"] == target:
            raise HTTPException(409, f"Club is already {target}")
        transition(CLUB_APPROVAL, club["approval_status"], target)
        if club["approval_status"] == "approved" and not reason:
            raise HTTPException(422, "A reason is required to unapprove an approved club")
        await conn.execute(
            """UPDATE clubs SET approval_status=$2, approved_by=$3, approved_at=now(),
                                approval_reason=$4, updated_at=now() WHERE id=$1""",
            club_id, target, user["id"], reason,
        )
        action = "club.unapprove" if club["approval_status"] == "approved" else f"club.{body.decision}"
        await audit.log(conn, actor_id=user["id"], action=action, entity="clubs",
                        entity_id=club_id, before={"approval_status": club["approval_status"]},
                        after={"approval_status": target}, reason=reason)
    return await _club_out(conn, club_id)


@router.post("/{club_id}/status")
async def set_club_status(club_id: int, body: ClubStatusIn,
                          user: dict = Depends(require_permission("club.deactivate")),
                          conn=Depends(get_conn)):
    """Deactivate (or reactivate) a club. Members, club days, attendance,
    submissions and certificates are kept; the club only stops accepting new
    join requests, club days and check-in windows."""
    reason = (body.reason or "").strip() or None
    if not body.active and not reason:
        raise HTTPException(422, "A reason is required to deactivate a club")
    async with conn.transaction():
        club = await assert_club_access(conn, user, club_id, allow=ADMIN_ROLES)
        await conn.execute("SELECT 1 FROM clubs WHERE id=$1 FOR UPDATE", club_id)
        if club["is_active"] == body.active:
            raise HTTPException(409, f"Club is already {'active' if body.active else 'deactivated'}")
        await conn.execute(
            """UPDATE clubs SET is_active=$2,
                 deactivated_at=CASE WHEN $2 THEN NULL ELSE now() END,
                 deactivated_by=CASE WHEN $2 THEN NULL ELSE $3::bigint END,
                 updated_at=now() WHERE id=$1""",
            club_id, body.active, user["id"],
        )
        await audit.log(conn, actor_id=user["id"],
                        action="club.reactivate" if body.active else "club.deactivate",
                        entity="clubs", entity_id=club_id,
                        before={"is_active": club["is_active"]}, after={"is_active": body.active},
                        reason=reason)
    return await _club_out(conn, club_id)


@router.delete("/{club_id}")
async def delete_club(club_id: int, user: dict = Depends(require_permission("club.delete")),
                      conn=Depends(get_conn)):
    """Permanently remove a club that has no history. Clubs with members, club
    days or budget requests must be deactivated instead so records survive."""
    async with conn.transaction():
        club = await assert_club_access(conn, user, club_id, allow=ADMIN_ROLES)
        await conn.execute("SELECT 1 FROM clubs WHERE id=$1 FOR UPDATE", club_id)
        history = await conn.fetchrow(
            """SELECT
                 (SELECT count(*) FROM club_memberships WHERE club_id=$1) AS memberships,
                 (SELECT count(*) FROM club_days WHERE club_id=$1) AS club_days,
                 (SELECT count(*) FROM club_budget_requests WHERE club_id=$1) AS budgets""",
            club_id,
        )
        if any(history.values()):
            raise HTTPException(
                409,
                "This club has memberships, club days or budget requests. Deactivate it "
                "instead so its history is preserved.",
            )
        await conn.execute("DELETE FROM club_coordinators WHERE club_id=$1", club_id)
        await conn.execute("DELETE FROM clubs WHERE id=$1", club_id)
        await audit.log(conn, actor_id=user["id"], action="club.delete", entity="clubs",
                        entity_id=club_id, before={"name": club["name"]}, after=None)
    return {"deleted": True, "id": club_id}


@router.patch("/{club_id}")
async def update_club(
    club_id: int,
    body: ClubUpdateIn,
    user: dict = Depends(require_permission("club.edit")),
    conn=Depends(get_conn),
):
    club = await assert_club_access(conn, user, club_id, allow=ADMIN_ROLES)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(422, "Provide at least one field to update")
    for key in ("name", "description", "capacity", "rules"):
        if key in fields and fields[key] is None:
            raise HTTPException(422, f"{key} cannot be null")
    if "advisor_id" in fields:
        await _validate_advisor(conn, fields["advisor_id"], club["campus_id"])
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip()
        if not fields["name"]:
            raise HTTPException(422, "Club name cannot be blank")
    if "description" in fields and fields["description"] is not None:
        fields["description"] = fields["description"].strip()
    allowed = ("name", "description", "capacity", "advisor_id", "rules")
    values = [fields[k] for k in allowed if k in fields]
    assignments = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(k for k in allowed if k in fields))
    try:
        async with conn.transaction():
            locked = await conn.fetchrow(
                "SELECT id FROM clubs WHERE id=$1 FOR UPDATE", club_id
            )
            if locked is None:
                raise HTTPException(404, "Club not found")
            if fields.get("capacity") is not None:
                members = await conn.fetchval(
                    "SELECT count(*) FROM club_memberships WHERE club_id=$1 AND status='approved'",
                    club_id,
                )
                if fields["capacity"] < members:
                    raise HTTPException(409, "Capacity cannot be lower than the approved member count")
            await conn.execute(
                f"UPDATE clubs SET {assignments}, updated_at=now() WHERE id=$1", club_id, *values
            )
            await audit.log(conn, actor_id=user["id"], action="club.update", entity="clubs",
                            entity_id=club_id,
                            before={k: club[k] for k in allowed if k in fields},
                            after={k: fields[k] for k in allowed if k in fields})
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(409, "A club with this name already exists on that campus") from exc
    return await _club_out(conn, club_id)


@router.post("/{club_id}/coordinators", status_code=201)
async def add_coordinator(
    club_id: int,
    body: CoordinatorIn,
    user: dict = Depends(require_permission("club.coordinators")),
    conn=Depends(get_conn),
):
    club = await assert_club_access(conn, user, club_id, allow=ADMIN_ROLES)
    target = await conn.fetchrow("SELECT role, campus_id FROM users WHERE id=$1", body.user_id)
    if target is None or target["role"] != "coordinator" or target["campus_id"] != club["campus_id"]:
        raise HTTPException(422, "User must be a coordinator on the club's campus")
    await conn.execute(
        "INSERT INTO club_coordinators (club_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        club_id, body.user_id,
    )
    return {"club_id": club_id, "user_id": body.user_id}


@router.delete("/{club_id}/coordinators/{user_id}")
async def remove_coordinator(
    club_id: int,
    user_id: int,
    user: dict = Depends(require_permission("club.coordinators")),
    conn=Depends(get_conn),
):
    await assert_club_access(conn, user, club_id, allow=ADMIN_ROLES)
    result = await conn.execute(
        "DELETE FROM club_coordinators WHERE club_id=$1 AND user_id=$2", club_id, user_id
    )
    if result.endswith(" 0"):
        raise HTTPException(404, "That user is not a coordinator of this club")
    await audit.log(conn, actor_id=user["id"], action="club.coordinator_remove", entity="clubs",
                    entity_id=club_id, before={"coordinator_id": user_id}, after=None)
    return {"removed": True}
