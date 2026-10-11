"""Club Day CRUD, plan approval, rescheduling and lifecycle transitions.

Lifecycle: planned -> approved -> announced -> open -> submissions -> evaluating -> closed
- planned -> approved happens ONLY through the advisor approving the plan.
- every other step goes through POST /{id}/transition (rules in core/state_machines.py).

Plan workflow: draft -> pending (submitted) -> approved | rejected -> (edit) draft/pending
"""
import hashlib
import json
from datetime import date, datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.core import audit
from app.core.permissions import (
    CLUB_MANAGER_ROLES, assert_club_access, assert_club_active, current_user,
    require_permission,
)
from app.core.state_machines import CLUB_DAY, PLAN, transition
from app.core.timeutil import app_tz, today
from app.db import get_conn
from app.services import checkin
from app.services.calendar_import import (
    TEMPLATE, CalendarCSVError, parse_calendar_csv, parse_club_ids,
)
from app.services.notify import (
    CLUB_DAY_SCHEDULE_KINDS, cancel_outdated, club_member_ids, club_staff_ids, notify_users,
)

router = APIRouter(prefix="/club-days", tags=["club-days"])

ADVISOR_ROLES = ("advisor", "campus_admin", "super_admin")
VIEW_ROLES = ("coordinator", "advisor", "campus_admin", "super_admin")
STUDENT_VISIBLE = ("announced", "open", "submissions", "evaluating", "closed")
RESCHEDULABLE = ("planned", "approved", "announced")


def _check_schedule(day_date: date | None, start: time | None, end: time | None,
                    deadline: datetime | None):
    if start and end and end <= start:
        raise HTTPException(422, "End time must be later than start time")
    if (end and not start):
        raise HTTPException(422, "Give a start time when you give an end time")
    if deadline and day_date and deadline.astimezone(app_tz()).date() < day_date:
        raise HTTPException(422, "The submission deadline cannot be before the Club Day")


class ClubDayIn(BaseModel):
    club_id: int
    day_date: date
    title: str | None = Field(default=None, max_length=160)
    start_time: time | None = None
    end_time: time | None = None
    # must include a timezone offset, e.g. 2026-10-20T17:00:00+05:30
    submission_deadline: AwareDatetime | None = None


class PlanIn(BaseModel):
    body: str | None = Field(default=None, max_length=4000)
    topic: str | None = Field(default=None, max_length=240)
    format: str | None = Field(default=None, max_length=120)
    deliverable: str | None = Field(default=None, max_length=500)
    venue: str | None = Field(default=None, max_length=240)
    # False saves a private draft; True submits the plan for advisor approval.
    submit: bool = True

    @model_validator(mode="after")
    def strip_and_check(self):
        for name in ("body", "topic", "format", "deliverable", "venue"):
            value = getattr(self, name)
            if isinstance(value, str):
                setattr(self, name, value.strip() or None)
        if self.submit:
            problems = []
            if self.body is None or len(self.body) < 10:
                if not self.topic or len(self.topic) < 2:
                    problems.append("topic (at least 2 characters)")
                if not self.format or len(self.format) < 2:
                    problems.append("format (at least 2 characters)")
                if not self.deliverable or len(self.deliverable) < 2:
                    problems.append("student deliverable (at least 2 characters)")
            if problems:
                raise ValueError("To submit the plan, fill in: " + ", ".join(problems))
        elif not any((self.body, self.topic, self.format, self.deliverable, self.venue)):
            raise ValueError("A draft needs at least one filled-in field")
        return self


class PlanDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=1000)


class TransitionIn(BaseModel):
    target: Literal["announced", "open", "submissions", "evaluating", "closed"]


class PresenterIn(BaseModel):
    student_id: int
    title: str = Field(min_length=2, max_length=240)
    notes: str | None = Field(default=None, max_length=1000)


class RescheduleIn(BaseModel):
    day_date: date
    start_time: time | None = None
    end_time: time | None = None
    submission_deadline: AwareDatetime | None = None
    reason: str = Field(min_length=3, max_length=500)


async def _visible_day(conn, user: dict, club_day_id: int):
    day = await conn.fetchrow("SELECT * FROM club_days WHERE id=$1", club_day_id)
    if day is None:
        raise HTTPException(404, "Club day not found")
    if user["role"] == "student":
        member = await conn.fetchval(
            """SELECT 1 FROM club_memberships
               WHERE student_id=$1 AND club_id=$2 AND status='approved'""",
            user["id"], day["club_id"],
        )
        # students must not even learn that unannounced club days exist
        if not member or day["status"] not in STUDENT_VISIBLE:
            raise HTTPException(404, "Club day not found")
    else:
        await assert_club_access(conn, user, day["club_id"], allow=VIEW_ROLES)
    return day


@router.post("", status_code=201)
async def create_club_day(
    body: ClubDayIn,
    user: dict = Depends(require_permission("club_day.create")),
    conn=Depends(get_conn),
):
    club = await assert_club_access(conn, user, body.club_id)
    if club["approval_status"] != "approved":
        raise HTTPException(409, "Club must be approved before scheduling a Club Day")
    assert_club_active(club, "Scheduling a Club Day")
    _check_schedule(body.day_date, body.start_time, body.end_time, body.submission_deadline)
    title = (body.title or "").strip() or None
    row = await conn.fetchrow(
        """INSERT INTO club_days (club_id, day_date, title, start_time, end_time,
                                  submission_deadline, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        body.club_id, body.day_date, title, body.start_time, body.end_time,
        body.submission_deadline, user["id"],
    )
    return dict(row)


@router.get("/import/template")
async def import_template(user: dict = Depends(require_permission("club_day.import"))):
    return Response(TEMPLATE, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="club-day-calendar-template.csv"'})


@router.post("/import", status_code=201)
async def import_club_days(
    file: UploadFile = File(...),
    club_ids: str = Form(..., description="Comma-separated club IDs"),
    dry_run: bool = Query(False, description="Validate and preview without saving"),
    user: dict = Depends(require_permission("club_day.import")),
    conn=Depends(get_conn),
):
    """Import academic-calendar dates from CSV for selected clubs.

    Columns: day_date (required, YYYY-MM-DD); optional title, start_time and
    end_time (HH:MM), submission_deadline (ISO 8601 with timezone).
    One row is created per date and club; a date+title already present for a
    club is skipped. With dry_run=true nothing is saved and the response is a
    preview. A real import saves nothing unless every row is valid.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(415, "Upload a .csv calendar file")
    raw = await file.read(2_000_001)
    try:
        ids = parse_club_ids(club_ids)
        parsed = parse_calendar_csv(raw, today=today())
    except (CalendarCSVError, ValueError) as exc:
        raise HTTPException(422, f"Invalid calendar CSV: {exc}") from exc

    report = {
        "dry_run": dry_run,
        "columns": parsed.columns,
        "valid_rows": len(parsed.rows),
        "invalid_rows": len(parsed.errors),
        "errors": parsed.errors,
        "warnings": parsed.warnings,
        "preview": [r.as_dict() for r in parsed.rows[:50]],
    }
    if parsed.errors and not dry_run:
        raise HTTPException(422, {
            "message": f"{len(parsed.errors)} row(s) are invalid; nothing was imported. "
                       "Fix the rows listed and upload again.",
            "report": report,
        })

    created = skipped = 0
    per_club = []
    async with conn.transaction():
        for club_id in ids:
            club = await assert_club_access(conn, user, club_id)
            if club["approval_status"] != "approved":
                raise HTTPException(409, f"Club {club_id} must be approved before importing dates")
            assert_club_active(club, f"Importing dates into club {club_id}")
            await conn.fetchrow("SELECT id FROM clubs WHERE id=$1 FOR UPDATE", club_id)
            club_created = club_skipped = 0
            for row in parsed.rows:
                exists = await conn.fetchval(
                    """SELECT 1 FROM club_days WHERE club_id=$1 AND day_date=$2
                         AND lower(coalesce(title,'')) = lower(coalesce($3,''))""",
                    club_id, row.day_date, row.title,
                )
                if exists:
                    club_skipped += 1
                    continue
                club_created += 1
                if dry_run:
                    continue
                new = await conn.fetchrow(
                    """INSERT INTO club_days (club_id, day_date, title, start_time, end_time,
                                              submission_deadline, created_by)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
                    club_id, row.day_date, row.title, row.start_time, row.end_time,
                    row.submission_deadline, user["id"],
                )
                await audit.log(conn, actor_id=user["id"], action="club_day.calendar_import",
                                entity="club_days", entity_id=new["id"],
                                after={"club_id": club_id, "day_date": row.day_date.isoformat(),
                                       "title": row.title})
            per_club.append({"club_id": club_id, "club_name": club["name"],
                             "created": club_created, "skipped": club_skipped})
            created += club_created
            skipped += club_skipped
    report.update({"created": 0 if dry_run else created, "would_create": created,
                   "skipped": skipped, "clubs": len(ids), "calendar_rows": len(parsed.rows),
                   "per_club": per_club})
    return report


_PLAN_COLUMNS = """p.body AS plan_body, p.topic AS plan_topic, p.format AS plan_format,
                   p.deliverable AS plan_deliverable, p.venue AS plan_venue"""
_STAFF_PLAN_COLUMNS = """, p.status AS plan_status, p.updated_at AS plan_updated_at,
                   p.submitted_at AS plan_submitted_at, p.decided_at AS plan_decided_at,
                   p.decision_reason AS plan_decision_reason, pa.name AS plan_decided_by_name"""


@router.get("")
async def list_club_days(
    club_id: int | None = None,
    upcoming: bool = False,
    user: dict = Depends(current_user),
    conn=Depends(get_conn),
):
    """Row-level scoping by role. upcoming=true limits to today and later,
    excluding closed days, soonest first."""
    role = user["role"]
    params: list = []
    if role == "student":
        params.append(user["id"])
        where = f"""WHERE d.status IN {STUDENT_VISIBLE}
                    AND d.club_id IN (SELECT club_id FROM club_memberships
                                      WHERE student_id=$1 AND status='approved')"""
    elif role == "coordinator":
        params.append(user["id"])
        where = "WHERE d.club_id IN (SELECT club_id FROM club_coordinators WHERE user_id=$1)"
    elif role == "advisor":
        params.append(user["id"])
        where = "WHERE c.advisor_id=$1"
    elif role == "campus_admin":
        params.append(user["campus_id"])
        where = "WHERE c.campus_id=$1"
    else:
        where = "WHERE TRUE"
    if club_id is not None:
        params.append(club_id)
        where += f" AND d.club_id=${len(params)}"
    order = "d.day_date DESC, d.id DESC"
    if upcoming:
        params.append(today())
        where += f" AND d.day_date >= ${len(params)} AND d.status <> 'closed'"
        order = "d.day_date, d.start_time NULLS LAST, d.id"
    staff_cols = "" if role == "student" else _STAFF_PLAN_COLUMNS
    rows = await conn.fetch(
        f"""SELECT d.*, c.name AS club_name, c.is_active AS club_active, {_PLAN_COLUMNS} {staff_cols}
            FROM club_days d
            JOIN clubs c ON c.id = d.club_id
            LEFT JOIN activity_plans p ON p.club_day_id=d.id
            LEFT JOIN users pa ON pa.id = p.approved_by
            {where} ORDER BY {order}""",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/{club_day_id}")
async def get_club_day(
    club_day_id: int, user: dict = Depends(current_user), conn=Depends(get_conn)
):
    day = await _visible_day(conn, user, club_day_id)
    out = dict(day)
    out["club_name"] = await conn.fetchval("SELECT name FROM clubs WHERE id=$1", day["club_id"])
    if user["role"] != "student":
        plan = await conn.fetchrow(
            """SELECT p.*, ua.name AS decided_by_name, us.name AS submitted_by_name,
                      uu.name AS updated_by_name
               FROM activity_plans p
               LEFT JOIN users ua ON ua.id=p.approved_by
               LEFT JOIN users us ON us.id=p.submitted_by
               LEFT JOIN users uu ON uu.id=p.updated_by
               WHERE p.club_day_id=$1""", club_day_id
        )
        out["plan"] = dict(plan) if plan else None
    return out


@router.get("/{club_day_id}/schedule-history")
async def schedule_history(club_day_id: int, user: dict = Depends(current_user), conn=Depends(get_conn)):
    await _visible_day(conn, user, club_day_id)
    rows = await conn.fetch(
        """SELECT s.version, s.previous, s.current, s.reason, s.changed_at, u.name AS changed_by_name
           FROM schedule_changes s LEFT JOIN users u ON u.id=s.changed_by
           WHERE s.entity='club_day' AND s.entity_id=$1 ORDER BY s.version DESC""",
        club_day_id,
    )
    return [dict(r) for r in rows]


@router.get("/{club_day_id}/presenters")
async def list_presenters(club_day_id: int, user: dict = Depends(current_user), conn=Depends(get_conn)):
    day = await _visible_day(conn, user, club_day_id)
    if user["role"] == "student":
        raise HTTPException(403, "Presenter records are staff-only")
    rows = await conn.fetch(
        """SELECT p.*, u.name AS student_name, u.student_code
           FROM club_day_presenters p JOIN users u ON u.id=p.student_id
           WHERE p.club_day_id=$1 ORDER BY p.marked_at""", day["id"],
    )
    return [dict(row) for row in rows]


@router.post("/{club_day_id}/presenters", status_code=201)
async def mark_presenter(club_day_id: int, body: PresenterIn,
                         user: dict = Depends(require_permission("club_day.transition")),
                         conn=Depends(get_conn)):
    async with conn.transaction():
        day = await conn.fetchrow("SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id)
        if day is None:
            raise HTTPException(404, "Club day not found")
        await assert_club_access(conn, user, day["club_id"])
        if day["status"] not in ("open", "submissions", "evaluating", "closed"):
            raise HTTPException(409, "Presenters can be recorded once the Club Day is open")
        if not body.title.strip():
            raise HTTPException(422, "Presentation title cannot be blank")
        member = await conn.fetchval(
            "SELECT 1 FROM club_memberships WHERE club_id=$1 AND student_id=$2 AND status='approved'",
            day["club_id"], body.student_id,
        )
        if not member:
            raise HTTPException(422, "Presenter must be an approved member of this club")
        row = await conn.fetchrow(
            """INSERT INTO club_day_presenters (club_day_id, student_id, title, notes, marked_by)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (club_day_id, student_id)
               DO UPDATE SET title=EXCLUDED.title, notes=EXCLUDED.notes,
                             marked_by=EXCLUDED.marked_by, marked_at=now()
               RETURNING *""",
            club_day_id, body.student_id, body.title.strip(), body.notes, user["id"],
        )
        await audit.log(conn, actor_id=user["id"], action="club_day.presenter_marked",
                        entity="club_day_presenters", entity_id=row["id"],
                        after={"student_id": body.student_id, "title": body.title.strip()})
    return dict(row)


def _plan_fingerprint(body: PlanIn) -> str:
    content = {k: getattr(body, k) for k in ("body", "topic", "format", "deliverable", "venue")}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()[:16]


@router.put("/{club_day_id}/plan")
async def submit_plan(
    club_day_id: int,
    body: PlanIn,
    user: dict = Depends(require_permission("club_day.plan.edit")),
    conn=Depends(get_conn),
):
    """Save a draft (submit=false) or submit/resubmit the plan for approval.

    Submitting the same content again while it is awaiting review is a no-op
    (no duplicate audit entry or advisor notification)."""
    target = "pending" if body.submit else "draft"
    async with conn.transaction():
        day = await conn.fetchrow("SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id)
        if day is None:
            raise HTTPException(404, "Club day not found")
        club = await assert_club_access(conn, user, day["club_id"])
        if day["status"] != "planned":
            raise HTTPException(409, "The plan can only be edited while the club day is 'planned'")
        existing = await conn.fetchrow(
            "SELECT * FROM activity_plans WHERE club_day_id=$1 FOR UPDATE", club_day_id
        )
        if existing is not None:
            transition(PLAN, existing["status"], target)
            same = all(existing[k] == getattr(body, k)
                       for k in ("topic", "format", "deliverable", "venue"))
            if same and existing["status"] == target and (
                    body.body is None or existing["body"] == body.body):
                out = dict(existing)
                out["unchanged"] = True
                return out
        legacy_body = body.body or (
            f"Topic: {body.topic}\nFormat: {body.format}\nDeliverable: {body.deliverable}"
            if body.submit else None)
        row = await conn.fetchrow(
            """INSERT INTO activity_plans (club_day_id, body, topic, format, deliverable, venue,
                                           status, updated_by, updated_at, submitted_at, submitted_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),
                       CASE WHEN $7='pending' THEN now() END,
                       CASE WHEN $7='pending' THEN $8::bigint END)
               ON CONFLICT (club_day_id)
               DO UPDATE SET body = EXCLUDED.body, topic = EXCLUDED.topic,
                             format = EXCLUDED.format, deliverable = EXCLUDED.deliverable,
                             venue = EXCLUDED.venue, status = EXCLUDED.status,
                             approved_by = NULL, decided_at = NULL, decision_reason =
                               CASE WHEN EXCLUDED.status='pending' THEN NULL
                                    ELSE activity_plans.decision_reason END,
                             updated_by = EXCLUDED.updated_by, updated_at = now(),
                             submitted_at = COALESCE(EXCLUDED.submitted_at, activity_plans.submitted_at),
                             submitted_by = COALESCE(EXCLUDED.submitted_by, activity_plans.submitted_by)
               RETURNING *""",
            club_day_id, legacy_body, body.topic, body.format, body.deliverable, body.venue,
            target, user["id"],
        )
        await audit.log(conn, actor_id=user["id"],
                        action="plan.submit" if body.submit else "plan.draft",
                        entity="activity_plans", entity_id=row["id"],
                        before={"status": existing["status"]} if existing else None,
                        after={"status": target})
        if body.submit:
            advisor = club["advisor_id"]
            await notify_users(
                conn, [advisor] if advisor and advisor != user["id"] else [],
                "club_day.plan_submitted",
                {"club_day_id": club_day_id, "club_id": club["id"], "club_name": club["name"],
                 "title": day["title"], "day_date": day["day_date"], "topic": body.topic},
                f"club_day.plan_submitted:{club_day_id}:{_plan_fingerprint(body)}",
            )
    return dict(row)


@router.post("/{club_day_id}/plan/decision")
async def decide_plan(
    club_day_id: int,
    body: PlanDecisionIn,
    user: dict = Depends(require_permission("club_day.plan.decide")),
    conn=Depends(get_conn),
):
    """Advisor approves/rejects. Approving also moves the club day planned -> approved."""
    target = "approved" if body.decision == "approve" else "rejected"
    reason = (body.reason or "").strip() or None
    async with conn.transaction():
        day = await conn.fetchrow(
            "SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id
        )
        if day is None:
            raise HTTPException(404, "Club day not found")
        club = await assert_club_access(conn, user, day["club_id"], allow=ADVISOR_ROLES)
        plan = await conn.fetchrow(
            "SELECT * FROM activity_plans WHERE club_day_id=$1 FOR UPDATE", club_day_id
        )
        if plan is None or plan["status"] == "draft":
            raise HTTPException(404, "No plan has been submitted yet")
        if plan["status"] != "pending":
            raise HTTPException(409, f"Plan is already {plan['status']}")

        new_plan = await conn.fetchrow(
            """UPDATE activity_plans SET status=$2, approved_by=$3, decided_at=now(),
                      decision_reason=$4 WHERE id=$1 RETURNING *""",
            plan["id"], target, user["id"], reason,
        )
        if target == "approved":
            new_status = transition(CLUB_DAY, day["status"], "approved")
            await conn.execute(
                "UPDATE club_days SET status=$2 WHERE id=$1", club_day_id, new_status
            )
        await audit.log(
            conn, actor_id=user["id"], action=f"plan.{target}",
            entity="activity_plans", entity_id=plan["id"],
            before={"status": plan["status"]}, after={"status": target},
            reason=reason,
        )
        coordinators = [r["user_id"] for r in await conn.fetch(
            "SELECT user_id FROM club_coordinators WHERE club_id=$1", day["club_id"])]
        await notify_users(
            conn, [c for c in coordinators if c != user["id"]], f"club_day.plan_{target}",
            {"club_day_id": club_day_id, "club_id": club["id"], "club_name": club["name"],
             "title": day["title"], "day_date": day["day_date"], "reason": reason},
            f"club_day.plan_{target}:{plan['id']}:{new_plan['decided_at'].isoformat()}",
        )
    return dict(new_plan)


@router.post("/{club_day_id}/reschedule")
async def reschedule_club_day(
    club_day_id: int,
    body: RescheduleIn,
    user: dict = Depends(require_permission("club_day.reschedule")),
    conn=Depends(get_conn),
):
    """Move a Club Day to a new date/time. The previous schedule is kept in
    schedule_changes, reminders about the old date are marked outdated, and
    members (once the day is announced) plus club staff are notified once."""
    _check_schedule(body.day_date, body.start_time, body.end_time, body.submission_deadline)
    if body.day_date < today():
        raise HTTPException(422, "The new date cannot be in the past")
    async with conn.transaction():
        day = await conn.fetchrow("SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id)
        if day is None:
            raise HTTPException(404, "Club day not found")
        club = await assert_club_access(conn, user, day["club_id"])
        if day["status"] not in RESCHEDULABLE:
            raise HTTPException(409, f"A Club Day that is '{day['status']}' can no longer be rescheduled")
        previous = {"day_date": day["day_date"], "start_time": day["start_time"],
                    "end_time": day["end_time"], "submission_deadline": day["submission_deadline"]}
        current = {"day_date": body.day_date, "start_time": body.start_time,
                   "end_time": body.end_time, "submission_deadline": body.submission_deadline}
        if previous == current:
            raise HTTPException(409, "The new schedule is the same as the current one")
        version = day["schedule_version"] + 1
        row = await conn.fetchrow(
            """UPDATE club_days SET day_date=$2, start_time=$3, end_time=$4,
                      submission_deadline=$5, schedule_version=$6, rescheduled_at=now()
               WHERE id=$1 RETURNING *""",
            club_day_id, body.day_date, body.start_time, body.end_time,
            body.submission_deadline, version,
        )
        reason = body.reason.strip()
        await conn.execute(
            """INSERT INTO schedule_changes (entity, entity_id, version, previous, current, reason, changed_by)
               VALUES ('club_day', $1, $2, $3, $4, $5, $6)""",
            club_day_id, version, previous, current, reason, user["id"],
        )
        await audit.log(conn, actor_id=user["id"], action="club_day.reschedule",
                        entity="club_days", entity_id=club_day_id,
                        before=previous, after=current, reason=reason)
        outdated = await cancel_outdated(conn, payload_key="club_day_id", entity_id=club_day_id,
                                         kinds=CLUB_DAY_SCHEDULE_KINDS)
        recipients = set(await club_staff_ids(conn, club["id"]))
        if day["status"] in STUDENT_VISIBLE:
            recipients |= set(await club_member_ids(conn, club["id"]))
        recipients.discard(user["id"])
        notified = await notify_users(
            conn, recipients, "club_day.rescheduled",
            {"club_day_id": club_day_id, "club_id": club["id"], "club_name": club["name"],
             "title": day["title"], "day_date": body.day_date,
             "previous_day_date": day["day_date"],
             "start_time": body.start_time.strftime("%H:%M") if body.start_time else None,
             "end_time": body.end_time.strftime("%H:%M") if body.end_time else None,
             "deadline": body.submission_deadline, "reason": reason, "version": version},
            f"club_day.rescheduled:{club_day_id}:v{version}",
        )
    out = dict(row)
    out["notified"] = notified
    out["outdated_reminders"] = outdated
    return out


@router.post("/{club_day_id}/transition")
async def move_club_day(
    club_day_id: int,
    body: TransitionIn,
    user: dict = Depends(require_permission("club_day.transition")),
    conn=Depends(get_conn),
):
    closed_sessions: list[int] = []
    async with conn.transaction():
        day = await conn.fetchrow(
            "SELECT * FROM club_days WHERE id=$1 FOR UPDATE", club_day_id
        )
        if day is None:
            raise HTTPException(404, "Club day not found")
        await assert_club_access(conn, user, day["club_id"])

        new_status = transition(CLUB_DAY, day["status"], body.target)  # 409 if illegal

        if day["status"] == "open":
            # leaving 'open' ends any live check-in window
            rows = await conn.fetch(
                """UPDATE checkin_sessions SET closes_at = now(), closed_by = $2
                   WHERE club_day_id=$1 AND closes_at > now() RETURNING id""",
                club_day_id, user["id"],
            )
            closed_sessions = [r["id"] for r in rows]

        row = await conn.fetchrow(
            "UPDATE club_days SET status=$2 WHERE id=$1 RETURNING *",
            club_day_id, new_status,
        )
        await audit.log(
            conn, actor_id=user["id"], action="club_day.transition",
            entity="club_days", entity_id=club_day_id,
            before={"status": day["status"]}, after={"status": new_status},
        )
    # drop cached copies AFTER commit so the scan path re-reads the new closes_at
    for sid in closed_sessions:
        await checkin.invalidate_session(sid)
    return dict(row)
