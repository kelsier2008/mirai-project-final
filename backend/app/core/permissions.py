"""Reusable access control. Endpoints never hand-roll role checks.

- ROLE_PERMISSIONS        -> the one table that says which role may do what
- require_permission(...) -> endpoint dependency built from that table
- require_role(...)       -> which roles may call an endpoint at all (older endpoints)
- assert_club_access(...) -> row-level scoping: may THIS user touch THIS club?

Role summary
- super_admin   (program manager): every campus, every feature
- campus_admin  (campus manager): everything inside their own campus
- advisor       (faculty advisor): clubs they advise; approves plans, issues achievements
- coordinator   (club coordinator): clubs they coordinate; club days, check-in, grading
- student: their own memberships, check-ins, submissions, records and inbox
"""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token

bearer = HTTPBearer(auto_error=False)

ROLES = ("student", "coordinator", "advisor", "campus_admin", "super_admin")
ADMIN_ROLES = ("campus_admin", "super_admin")
CLUB_MANAGER_ROLES = ("coordinator", "campus_admin", "super_admin")
STAFF_ROLES = ("coordinator", "advisor", "campus_admin", "super_admin")

_ADMIN = set(ADMIN_ROLES)
_MANAGERS = set(CLUB_MANAGER_ROLES)
_STAFF = set(STAFF_ROLES)

# Capability -> roles. Row-level scoping (campus / club) is applied separately
# by assert_club_access and the SQL scoping helpers.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    # administration
    "campus.create": frozenset({"super_admin"}),
    "user.manage": frozenset(_ADMIN),
    # clubs
    "club.view": frozenset(ROLES),
    "club.create": frozenset(_ADMIN),
    "club.edit": frozenset(_ADMIN),
    "club.approve": frozenset(_ADMIN),
    "club.deactivate": frozenset(_ADMIN),
    "club.delete": frozenset(_ADMIN),
    "club.coordinators": frozenset(_ADMIN),
    "club.join": frozenset({"student"}),
    "membership.decide": frozenset(_MANAGERS),
    # club days
    "club_day.create": frozenset(_MANAGERS),
    "club_day.plan.edit": frozenset(_MANAGERS),
    "club_day.plan.decide": frozenset({"advisor", "campus_admin", "super_admin"}),
    "club_day.transition": frozenset(_MANAGERS),
    "club_day.reschedule": frozenset(_MANAGERS),
    "club_day.import": frozenset(_MANAGERS),
    # check-in
    "checkin.run": frozenset(_MANAGERS),
    "checkin.view": frozenset(_STAFF),
    "checkin.scan": frozenset({"student"}),
    # submissions and grading
    "submission.create": frozenset({"student"}),
    "submission.grade": frozenset(_MANAGERS),
    "submission.view_all": frozenset(_STAFF),
    # events
    "event.manage": frozenset(_ADMIN),
    "event.reschedule": frozenset(_ADMIN),
    "event.register": frozenset({"student"}),
    # budgets
    "budget.request": frozenset(_STAFF),
    "budget.decide": frozenset(_ADMIN),
    # records, dashboards, notifications
    "duty_leave.decide": frozenset(_ADMIN),
    "transcript.view_any": frozenset(_ADMIN),
    "dashboard.view": frozenset(_STAFF),
    "notification.history": frozenset(_ADMIN),
}


def permissions_for(role: str) -> list[str]:
    return sorted(p for p, roles in ROLE_PERMISSIONS.items() if role in roles)


def has_permission(user: dict, permission: str) -> bool:
    return user["role"] in ROLE_PERMISSIONS[permission]


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        p = decode_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if p.get("role") not in ROLES:
        raise HTTPException(401, "Invalid or expired token")
    # Claims are trusted (no DB hit) to keep hot paths like check-in fast.
    return {"id": int(p["sub"]), "role": p["role"], "campus_id": p["campus_id"]}


def require_role(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Your role cannot perform this action")
        return user

    return dep


def require_permission(permission: str):
    allowed = ROLE_PERMISSIONS[permission]  # KeyError at import time for typos

    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(403, "Your role cannot perform this action")
        return user

    return dep


async def assert_club_access(
    conn, user: dict, club_id: int, allow: tuple = CLUB_MANAGER_ROLES
):
    """Raises 404/403 unless `user` may act on this club. Returns the club row."""
    club = await conn.fetchrow("SELECT * FROM clubs WHERE id = $1", club_id)
    if club is None:
        raise HTTPException(404, "Club not found")

    role = user["role"]
    if role not in allow:
        raise HTTPException(403, "Your role cannot perform this action")

    if role == "super_admin":
        return club
    if role == "campus_admin" and club["campus_id"] == user["campus_id"]:
        return club
    if role == "coordinator":
        ok = await conn.fetchval(
            "SELECT 1 FROM club_coordinators WHERE club_id=$1 AND user_id=$2",
            club_id, user["id"],
        )
        if ok:
            return club
    if role == "advisor" and club["advisor_id"] == user["id"]:
        return club

    raise HTTPException(403, "You do not have access to this club")


def assert_club_active(club, action: str = "This action"):
    """Deactivated clubs keep their history but accept no new activity."""
    if not club["is_active"]:
        raise HTTPException(409, f"{action} is not allowed while the club is deactivated")
