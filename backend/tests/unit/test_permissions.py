import asyncio

import pytest
from fastapi import HTTPException

from app.core.permissions import (
    ADMIN_ROLES, ROLE_PERMISSIONS, ROLES, has_permission, permissions_for, require_permission,
)


def test_every_permission_names_only_known_roles():
    for permission, roles in ROLE_PERMISSIONS.items():
        assert roles, permission
        assert set(roles) <= set(ROLES), permission


def test_students_have_no_administrative_permissions():
    student = set(permissions_for("student"))
    assert student == {"club.view", "club.join", "checkin.scan", "submission.create", "event.register"}


@pytest.mark.parametrize("permission", [
    "club.approve", "club.deactivate", "club.delete", "budget.decide",
    "notification.history", "user.manage", "transcript.view_any",
])
def test_admin_only_permissions(permission):
    assert ROLE_PERMISSIONS[permission] == frozenset(ADMIN_ROLES)


def test_super_admin_holds_every_non_student_permission():
    student_only = {p for p, roles in ROLE_PERMISSIONS.items() if roles == {"student"}}
    assert student_only == {"club.join", "checkin.scan", "submission.create", "event.register"}
    assert set(permissions_for("super_admin")) == set(ROLE_PERMISSIONS) - student_only


def test_coordinators_run_club_days_but_cannot_approve_plans():
    coord = {"role": "coordinator"}
    assert has_permission(coord, "checkin.run")
    assert has_permission(coord, "club_day.reschedule")
    assert has_permission(coord, "submission.grade")
    assert not has_permission(coord, "club_day.plan.decide")
    assert not has_permission(coord, "budget.decide")


def test_require_permission_refuses_with_403():
    dep = require_permission("budget.decide")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(dep(user={"id": 1, "role": "coordinator", "campus_id": 1}))
    assert exc.value.status_code == 403
    user = {"id": 2, "role": "campus_admin", "campus_id": 1}
    assert asyncio.run(dep(user=user)) is user


def test_unknown_permission_fails_at_definition_time():
    with pytest.raises(KeyError):
        require_permission("does.not.exist")
