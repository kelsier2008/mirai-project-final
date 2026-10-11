import pytest

from app.core.state_machines import CLUB_DAY, ENROLMENT, InvalidTransition, transition


def test_enrolment_pending_to_approved():
    assert transition(ENROLMENT, "pending", "approved") == "approved"


def test_enrolment_cannot_go_back():
    with pytest.raises(InvalidTransition):
        transition(ENROLMENT, "approved", "pending")


def test_club_day_happy_path():
    s = "planned"
    for nxt in ("approved", "announced", "open", "submissions", "evaluating", "closed"):
        s = transition(CLUB_DAY, s, nxt)
    assert s == "closed"


def test_club_day_cannot_skip_steps():
    with pytest.raises(InvalidTransition):
        transition(CLUB_DAY, "planned", "open")

def test_club_can_be_unapproved_and_reapproved():
    from app.core.state_machines import CLUB_APPROVAL
    assert transition(CLUB_APPROVAL, "approved", "rejected") == "rejected"
    assert transition(CLUB_APPROVAL, "rejected", "approved") == "approved"
    with pytest.raises(InvalidTransition):
        transition(CLUB_APPROVAL, "approved", "pending")


def test_plan_draft_flow():
    from app.core.state_machines import PLAN
    assert transition(PLAN, "draft", "pending") == "pending"
    assert transition(PLAN, "pending", "draft") == "draft"  # withdraw to keep editing
    assert transition(PLAN, "rejected", "pending") == "pending"
    with pytest.raises(InvalidTransition):
        transition(PLAN, "approved", "draft")
