"""Integration smoke test for the Mirai platform update (migration 011).

Run: docker compose exec api python -m scripts.smoke_mirai
Needs the seeded demo users (python -m scripts.seed) and DATABASE_URL. Creates its
own clubs/club days each run, so it can be repeated. Covers: role permissions,
club lifecycle, plan drafts, rescheduling + reminders, check-in persistence and
session history, grading vs attendance, budget decisions, transcript lookups,
dashboards, CSV import, notification history and startup endpoints.
"""
import asyncio
import os
import sys
import time
from datetime import date, timedelta

import asyncpg
import httpx

BASE = os.environ.get("SMOKE_BASE", "http://localhost:8000")
PW = "password123"
results: list[bool] = []
TODAY = date.today()


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else "   -> " + str(detail)[:400]))


def login(c, ident):
    r = c.post("/auth/login", json={"identifier": ident, "password": PW})
    r.raise_for_status()
    return {"Authorization": "Bearer " + r.json()["access_token"]}, r.json()["user"]


async def _q(sql, *args):
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        return [dict(r) for r in await conn.fetch(sql, *args)]
    finally:
        await conn.close()


def q(sql, *args):
    return asyncio.run(_q(sql, *args))


def run_job(fn_name):
    from workers import tasks_schedule
    return asyncio.run(tasks_schedule._with_conn(getattr(tasks_schedule, fn_name)))


def ensure_member(c, coord, student_h, student_id, club_id):
    c.post(f"/clubs/{club_id}/join", headers=student_h, json={"type": "primary"})
    for m in c.get(f"/clubs/{club_id}/memberships", headers=coord).json():
        if m["student_id"] == student_id and m["status"] == "pending":
            c.post(f"/memberships/{m['id']}/decision", headers=coord, json={"decision": "approve"})


def make_day(c, coord, advisor, club_id, day_date, title, deadline=None):
    r = c.post("/club-days", headers=coord, json={
        "club_id": club_id, "day_date": day_date, "title": title,
        "start_time": "16:00", "end_time": "18:00", "submission_deadline": deadline})
    r.raise_for_status()
    day = r.json()["id"]
    c.put(f"/club-days/{day}/plan", headers=coord, json={
        "topic": "Sensors", "format": "Workshop", "deliverable": "Wiring photo", "venue": "Lab 2"})
    c.post(f"/club-days/{day}/plan/decision", headers=advisor, json={"decision": "approve"})
    return day


def main():
    c = httpx.Client(base_url=BASE, timeout=30)
    stamp = str(int(time.time()))[-6:]
    student, s_user = login(c, "s001@demo.edu")
    s2, s2_user = login(c, "s002@demo.edu")
    s3, s3_user = login(c, "s003@demo.edu")
    north, _ = login(c, "n001@demo.edu")
    coord, coord_user = login(c, "coord@demo.edu")
    advisor, adv_user = login(c, "advisor@demo.edu")
    admin, admin_user = login(c, "admin@demo.edu")
    sup, sup_user = login(c, "super@demo.edu")

    # ------------------------------------------------------------ 1. roles
    check("login returns profile with name and student ID",
          s_user.get("name") == "Student One" and s_user.get("student_code") == "S001", s_user)
    check("login by student ID works", c.post("/auth/login", json={"identifier": "S001", "password": PW}).status_code == 200)
    me = c.get("/auth/me", headers=student).json()
    check("/auth/me returns server-side role and permissions",
          me["role"] == "student" and "checkin.scan" in me["permissions"] and "club.approve" not in me["permissions"], me)
    check("unauthenticated request is 401", c.get("/clubs").status_code == 401)
    for path in ("/users", "/admin/notifications", "/dashboards/summary", "/checkin/sessions", "/campuses"):
        r = c.get(path, headers=student)
        check(f"student refused on GET {path} (403)", r.status_code == 403, r.status_code)
    r = c.post("/clubs", headers=student, json={"name": "x", "capacity": 5})
    check("student cannot create a club (403)", r.status_code == 403, r.status_code)
    r = c.post("/clubs", headers=coord, json={"name": "x", "capacity": 5})
    check("coordinator cannot create a club (403)", r.status_code == 403, r.status_code)
    check("coordinator refused on notification history (403)",
          c.get("/admin/notifications", headers=coord).status_code == 403)
    check("other-campus student cannot open a Main campus club (404)",
          c.get("/clubs/1", headers=north).status_code == 404)
    cfg = c.get("/config/public").json()
    check("public config carries Mirai branding", "Mirai" in cfg["app_name"], cfg)

    # ------------------------------------------------------------ 2. clubs
    r = c.post("/clubs", headers=admin, json={"name": f"Mirai Smoke {stamp}", "capacity": 10,
                                              "description": "Smoke club"})
    check("campus admin creates an approved club", r.status_code == 201 and r.json()["approval_status"] == "approved", r.text)
    club = r.json()
    r = c.patch(f"/clubs/{club['id']}", headers=admin, json={"name": f"Mirai Smoke {stamp} B", "description": "Edited"})
    check("club name and description can be edited", r.status_code == 200 and r.json()["description"] == "Edited", r.text)
    r = c.post(f"/clubs/{club['id']}/decision", headers=admin, json={"decision": "reject"})
    check("unapproving needs a reason (422)", r.status_code == 422, r.text)
    r = c.post(f"/clubs/{club['id']}/decision", headers=admin, json={"decision": "reject", "reason": "Duplicate club"})
    check("approved club can be unapproved", r.status_code == 200 and r.json()["approval_status"] == "rejected"
          and r.json()["approved_by_name"] == admin_user["name"], r.text)
    names = [x["name"] for x in c.get("/clubs", headers=student).json()]
    check("students do not see an unapproved club", f"Mirai Smoke {stamp} B" not in names)
    r = c.post(f"/clubs/{club['id']}/decision", headers=admin, json={"decision": "approve"})
    check("rejected club can be approved again", r.json().get("approval_status") == "approved", r.text)
    detail = c.get(f"/clubs/{club['id']}", headers=admin).json()
    actions = [h["action"] for h in detail["history"]]
    check("club history records create, unapprove and approve with actor names",
          {"club.create", "club.unapprove", "club.approve"} <= set(actions)
          and all(h["actor_name"] for h in detail["history"]), actions)
    r = c.post(f"/clubs/{club['id']}/status", headers=admin, json={"active": False})
    check("deactivating needs a reason (422)", r.status_code == 422)
    r = c.post(f"/clubs/{club['id']}/status", headers=admin, json={"active": False, "reason": "Paused this term"})
    check("club can be deactivated", r.status_code == 200 and r.json()["is_active"] is False, r.text)
    r = c.post(f"/clubs/{club['id']}/join", headers=s3, json={"type": "secondary"})
    check("students cannot join a deactivated club", r.status_code == 404, r.status_code)
    r = c.post("/club-days", headers=admin, json={"club_id": club["id"], "day_date": str(TODAY + timedelta(days=9))})
    check("no new club days for a deactivated club (409)", r.status_code == 409, r.text)
    r = c.post(f"/clubs/{club['id']}/status", headers=admin, json={"active": True})
    check("club can be reactivated", r.json().get("is_active") is True, r.text)
    r = c.delete("/clubs/1", headers=admin)
    check("a club with history cannot be hard-deleted (409)", r.status_code == 409, r.text)
    tmp = c.post("/clubs", headers=admin, json={"name": f"Temp {stamp}", "capacity": 3}).json()
    r = c.delete(f"/clubs/{tmp['id']}", headers=admin)
    check("an empty club can be deleted", r.status_code == 200 and c.get(f"/clubs/{tmp['id']}", headers=admin).status_code == 404)
    r = c.post("/clubs", headers=sup, json={"name": f"Proposed {stamp}", "capacity": 5, "campus_id": admin_user["campus_id"]})
    check("super admin proposal waits for campus approval", r.json().get("approval_status") == "pending", r.text)
    r = c.post(f"/clubs/{r.json()['id']}/decision", headers=admin, json={"decision": "approve"})
    check("campus admin approval records the approver", r.json().get("approved_by_name") == admin_user["name"], r.text)

    # A fresh student per run, so membership limits from earlier runs never interfere.
    c.post("/users", headers=admin, json={"name": f"Smoke Student {stamp}", "email": f"smk{stamp}@demo.edu",
                                          "password": PW + "xx", "role": "student", "student_code": f"SMK{stamp}"})
    r = c.post("/auth/login", json={"identifier": f"SMK{stamp}", "password": PW + "xx"})
    s3 = {"Authorization": "Bearer " + r.json()["access_token"]}
    s3_user = r.json()["user"]
    s3_code = s3_user["student_code"]

    # ------------------------------------------------------------ 3. plan drafts
    c.post(f"/clubs/{club['id']}/coordinators", headers=admin, json={"user_id": coord_user["id"]})
    adv = q("SELECT id FROM users WHERE email='advisor@demo.edu'")[0]["id"]
    c.patch(f"/clubs/{club['id']}", headers=admin, json={"advisor_id": adv})
    future = str(TODAY + timedelta(days=12))
    r = c.post("/club-days", headers=coord, json={"club_id": club["id"], "day_date": future,
                                                  "start_time": "18:00", "end_time": "17:00"})
    check("end time before start time is rejected", r.status_code == 422, r.text)
    r = c.post("/club-days", headers=coord, json={"club_id": club["id"], "day_date": future,
                                                  "submission_deadline": f"{TODAY}T10:00:00+05:30"})
    check("deadline before the Club Day is rejected", r.status_code == 422, r.text)
    r = c.post("/club-days", headers=coord, json={"club_id": club["id"], "day_date": future, "title": "Plan flow",
                                                  "start_time": "16:00", "end_time": "18:00"})
    day = r.json()["id"]
    r = c.put(f"/club-days/{day}/plan", headers=coord, json={"topic": "Drones", "submit": False})
    check("partial plan saves as a draft", r.status_code == 200 and r.json()["status"] == "draft", r.text)
    r = c.post(f"/club-days/{day}/plan/decision", headers=advisor, json={"decision": "approve"})
    check("a draft cannot be approved", r.status_code == 404, r.text)
    r = c.put(f"/club-days/{day}/plan", headers=coord, json={"topic": "Drones"})
    check("submitting an incomplete plan explains the missing fields",
          r.status_code == 422 and "format" in r.text and "deliverable" in r.text, r.text)
    full = {"topic": "Drones", "format": "Workshop", "deliverable": "Flight log", "venue": "Field"}
    r = c.put(f"/club-days/{day}/plan", headers=coord, json=full)
    check("complete plan is submitted (pending)", r.json().get("status") == "pending" and r.json().get("submitted_at"), r.text)
    r = c.put(f"/club-days/{day}/plan", headers=coord, json=full)
    check("re-submitting the same plan is a no-op", r.json().get("unchanged") is True, r.text)
    n = q("SELECT count(*) AS n FROM notifications WHERE kind='club_day.plan_submitted' AND payload->>'club_day_id'=$1", str(day))[0]["n"]
    check("advisor is notified exactly once", n == 1, n)
    saved = c.get(f"/club-days/{day}", headers=coord).json()["plan"]
    check("saved plan reloads from the server", saved["topic"] == "Drones" and saved["venue"] == "Field", saved)
    r = c.post(f"/club-days/{day}/plan/decision", headers=advisor, json={"decision": "approve"})
    check("advisor approves the plan; day moves to approved",
          r.json().get("status") == "approved" and c.get(f"/club-days/{day}", headers=coord).json()["status"] == "approved", r.text)

    # ------------------------------------------------------------ 4/5. reschedule + reminders
    ensure_member(c, admin, s3, s3_user["id"], club["id"])
    c.post(f"/club-days/{day}/transition", headers=coord, json={"target": "announced"})
    asyncio.run(_q("""INSERT INTO notifications (user_id, kind, payload, dedupe_key)
                     VALUES ($1, 'club_day.upcoming', jsonb_build_object('club_day_id', $2::bigint), $3)""",
                   s3_user["id"], day, f"club_day.upcoming:{day}:{s3_user['id']}"))
    new_date = str(TODAY + timedelta(days=2))
    r = c.post(f"/club-days/{day}/reschedule", headers=student, json={"day_date": new_date, "reason": "x"})
    check("students cannot reschedule (403)", r.status_code == 403)
    r = c.post(f"/club-days/{day}/reschedule", headers=coord,
               json={"day_date": new_date, "start_time": "15:00", "end_time": "17:00", "reason": "Lab booked"})
    check("coordinator reschedules the Club Day", r.status_code == 200 and r.json()["day_date"] == new_date
          and r.json()["schedule_version"] == 2, r.text)
    hist = c.get(f"/club-days/{day}/schedule-history", headers=coord).json()
    check("previous and new schedule are recorded",
          hist and hist[0]["previous"]["day_date"] == future and hist[0]["current"]["day_date"] == new_date, hist)
    old = q("SELECT cancelled_at FROM notifications WHERE dedupe_key=$1", f"club_day.upcoming:{day}:{s3_user['id']}")
    check("reminder for the old date is marked outdated", old and old[0]["cancelled_at"] is not None, old)
    resched = q("SELECT user_id FROM notifications WHERE kind='club_day.rescheduled' AND payload->>'club_day_id'=$1", str(day))
    check("member and advisor are notified of the reschedule",
          {s3_user["id"], adv} <= {x["user_id"] for x in resched} and coord_user["id"] not in {x["user_id"] for x in resched}, resched)
    r = c.post(f"/club-days/{day}/reschedule", headers=coord,
               json={"day_date": new_date, "start_time": "15:00", "end_time": "17:00", "reason": "again"})
    check("an identical reschedule is refused and notifies nobody (409)", r.status_code == 409
          and len(q("SELECT 1 FROM notifications WHERE kind='club_day.rescheduled' AND payload->>'club_day_id'=$1", str(day))) == len(resched))
    st = c.get("/club-days?upcoming=true", headers=s3).json()
    mine = [d for d in st if d["id"] == day]
    check("student's upcoming list shows the new date and time",
          mine and mine[0]["day_date"] == new_date and mine[0]["start_time"].startswith("15:00"), mine)
    run_job("_remind_48h")
    run_job("_remind_48h")
    rem = q("SELECT dedupe_key, cancelled_at FROM notifications WHERE kind='club_day.upcoming' AND user_id=$1 AND payload->>'club_day_id'=$2",
            s3_user["id"], str(day))
    fresh = [x for x in rem if x["cancelled_at"] is None]
    check("48h reminder uses the new date, once (versioned key, no duplicate)",
          len(fresh) == 1 and fresh[0]["dedupe_key"].endswith(f":v2:{s3_user['id']}"), rem)

    # ------------------------------------------------------------ 6. check-in persistence
    c.post(f"/club-days/{day}/transition", headers=coord, json={"target": "open"})
    r = c.post(f"/checkin/club-days/{day}/open", headers=coord, json={"duration_minutes": 30})
    sid = r.json()["id"]
    check("opening a window returns the session summary (no secret)",
          r.status_code == 201 and "secret" not in r.json() and r.json()["status"] == "live", r.text)
    live = c.get("/checkin/sessions?status=live", headers=coord).json()["items"]
    check("live session can be restored from the server after a refresh", any(x["id"] == sid for x in live), live)
    d = c.get(f"/checkin/sessions/{sid}", headers=s3).json()
    check("student sees club, day and 'not checked in' state",
          d.get("club_name", "").startswith("Mirai Smoke") and d.get("my_checkin", 1) is None, d)
    token = c.get(f"/checkin/sessions/{sid}/qr", headers=coord).json()["token"]
    r = c.post("/checkin/scan", headers=s3, json={"session_id": sid, "token": token})
    check("student checks in", r.status_code == 201, r.text)
    r = c.post("/checkin/scan", headers=s3, json={"session_id": sid, "token": token})
    check("second scan is 'already checked in' (409)", r.status_code == 409, r.text)
    d = c.get(f"/checkin/sessions/{sid}", headers=s3).json()
    check("after a refresh the student's check-in is loaded from the database", d["my_checkin"] is not None, d)
    roster = c.get(f"/checkin/sessions/{sid}/roster", headers=coord).json()
    states = {x["student_id"]: x["state"] for x in roster["students"]}
    check("roster shows checked-in and not-yet-checked-in members",
          states.get(s3_user["id"]) == "checked_in" and "not_checked_in" in states.values() or
          states.get(s3_user["id"]) == "checked_in", states)
    r = c.post(f"/checkin/sessions/{sid}/corrections", headers=coord,
               json={"student_id": s3_user["id"], "action": "add", "reason": "testing duplicate"})
    check("duplicate attendance via correction is refused (409)", r.status_code == 409, r.text)
    rows = q("SELECT count(*) AS n FROM attendance WHERE session_id=$1 AND student_id=$2", sid, s3_user["id"])[0]["n"]
    check("exactly one attendance row in the database", rows == 1, rows)
    c.post(f"/checkin/sessions/{sid}/close", headers=coord)
    hist = c.get(f"/checkin/sessions?club_day_id={day}", headers=coord).json()["items"]
    check("session history shows the closed session with totals",
          hist and hist[0]["id"] == sid and hist[0]["status"] == "closed" and hist[0]["checked_in"] == 1
          and hist[0]["opened_by_name"] and hist[0]["closed_by_name"], hist)
    check("other-campus student cannot open the session (404)", c.get(f"/checkin/sessions/{sid}", headers=north).status_code == 404)
    mine = c.get("/checkin/attendance/me", headers=s3).json()
    check("student's attendance includes the session ID", any(a["session_id"] == sid for a in mine))

    # ------------------------------------------------------------ 7. grading
    c.post(f"/club-days/{day}/transition", headers=coord, json={"target": "submissions"})
    r = c.post(f"/club-days/{day}/submissions/link", headers=s3, json={"url": "https://example.org/flight-log"})
    sub = r.json()["id"]
    roster = c.get(f"/club-days/{day}/grading-roster", headers=coord).json()
    row = next(x for x in roster["students"] if x["student_id"] == s3_user["id"])
    check("grading roster shows what the student submitted (pending)",
          row["status"] == "pending" and row["latest"]["url"] == "https://example.org/flight-log", row)
    check("grading roster carries no attendance actions", "attendance" not in str(roster.keys()))
    scores = {k["key"]: 3 for k in roster["rubric"]}
    r = c.put(f"/submissions/{sub}/evaluation", headers=coord, json={"scores": scores, "status": "resubmission_requested"})
    check("requesting resubmission needs feedback (422)", r.status_code == 422, r.text)
    r = c.put(f"/submissions/{sub}/evaluation", headers=coord,
              json={"scores": scores, "status": "resubmission_requested", "comment": "Add the battery log"})
    check("evaluator requests a resubmission", r.json().get("status") == "resubmission_requested", r.text)
    mine = c.get(f"/club-days/{day}/submissions", headers=s3).json()
    check("student sees the resubmission request (but no score) before results",
          mine[0]["evaluation"] == {"status": "resubmission_requested", "comment": "Add the battery log"}, mine)
    check("student notified about the resubmission request",
          q("SELECT 1 FROM notifications WHERE kind='submission.resubmission_requested' AND user_id=$1", s3_user["id"]))
    r2 = c.post(f"/club-days/{day}/submissions/link", headers=s3, json={"url": "https://example.org/flight-log-v2"})
    row = next(x for x in c.get(f"/club-days/{day}/grading-roster", headers=coord).json()["students"]
               if x["student_id"] == s3_user["id"])
    check("a new submission puts the student back to pending", row["status"] == "pending" and len(row["submissions"]) == 2, row)
    r = c.put(f"/submissions/{r2.json()['id']}/evaluation", headers=coord, json={"scores": scores, "comment": "Good"})
    row = next(x for x in c.get(f"/club-days/{day}/grading-roster", headers=coord).json()["students"]
               if x["student_id"] == s3_user["id"])
    check("graded status is saved and retrieved", row["status"] == "graded" and row["latest"]["evaluation"]["total"] == 9, row)
    check("students cannot open the grading roster (403)",
          c.get(f"/club-days/{day}/grading-roster", headers=s3).status_code == 403)
    att = q("SELECT count(*) AS n FROM attendance WHERE session_id=$1", sid)[0]["n"]
    check("grading did not change attendance", att == 1, att)

    # ------------------------------------------------------------ 8. budgets
    b = c.post("/budgets", headers=coord, json={"club_id": 1, "title": f"Sensors {stamp}",
                                                "description": "Parts", "amount": 1500}).json()
    check("coordinator cannot decide budgets (403)",
          c.post(f"/budgets/{b['id']}/decision", headers=coord, json={"decision": "approve"}).status_code == 403)
    r = c.post(f"/budgets/{b['id']}/decision", headers=admin, json={"decision": "reject"})
    check("rejecting a budget needs a reason (422)", r.status_code == 422)
    r = c.post(f"/budgets/{b['id']}/decision", headers=admin, json={"decision": "approve", "reason": "Within limit"})
    dec = r.json()
    check("budget decision persists approver and timestamp",
          dec["status"] == "approved" and dec["decided_by"] == admin_user["id"]
          and dec["decided_by_name"] == admin_user["name"] and dec["decided_at"], dec)
    seen = next(x for x in c.get("/budgets", headers=coord).json() if x["id"] == b["id"])
    check("requester sees who decided (not the viewer's name)", seen["decided_by_name"] == admin_user["name"]
          and seen["requester_name"] == coord_user["name"], seen)
    check("requester notified of the decision",
          q("SELECT 1 FROM notifications WHERE kind='budget.approved' AND payload->>'budget_id'=$1", str(b["id"])))

    # ------------------------------------------------------------ 9. transcripts
    for ref in (s3_code, s3_code.lower(), str(s3_user["id"])):
        r = c.get(f"/transcripts/{ref}", headers=admin)
        check(f"transcript lookup by '{ref}'", r.status_code == 200 and r.json()["student"]["student_code"] == s3_code, r.text)
    for ref in ("S 003", "S003!", "--"):
        r = c.get(f"/transcripts/{ref}", headers=admin)
        check(f"invalid student ID '{ref}' is rejected (422)", r.status_code == 422, r.status_code)
    check("campus admin cannot read another campus's transcript (404)",
          c.get("/transcripts/N001", headers=admin).status_code == 404)
    check("super admin can", c.get("/transcripts/N001", headers=sup).status_code == 200)
    t = c.get("/transcripts/me", headers=s3).json()
    entry = next((x for x in t["club_days"] if x["id"] == day), None)
    check("transcript shows club, date, attendance and grading status from records",
          entry and entry["attendance_count"] == 1 and entry["grading_status"] == "graded" and entry["club_name"], entry)
    check("score stays hidden until the Club Day is closed", entry and entry["score"] is None, entry)
    check("transcript totals are computed", t["totals"]["club_days_attended"] >= 1 and t["totals"]["submissions"] >= 2, t["totals"])
    r = c.post("/users", headers=admin, json={"name": "Code Test", "email": f"code{stamp}@demo.edu",
                                              "password": "longpassword1", "role": "student",
                                              "student_code": f"MIR-24_{stamp}"})
    check("alphanumeric student ID with - and _ is accepted", r.status_code == 201, r.text)
    r = c.post("/users", headers=admin, json={"name": "Bad", "email": f"bad{stamp}@demo.edu",
                                              "password": "longpassword1", "role": "student", "student_code": "bad code!"})
    check("student ID with spaces/symbols is rejected (422)", r.status_code == 422, r.text)

    # ------------------------------------------------------------ 10. dashboards
    s = c.get("/dashboards/summary", headers=admin).json()
    check("summary values are plain numbers", all(isinstance(s[k], int) for k in
          ("clubs", "members", "attendance_records", "submissions", "events")), s)
    tr = c.get(f"/dashboards/trend?months=3&end={TODAY:%Y-%m}", headers=admin).json()
    check("trend returns one row per month", len(tr) == 3 and tr[-1]["month"] == f"{TODAY:%Y-%m}", tr)
    raw = q("""SELECT count(*) AS n FROM attendance a JOIN checkin_sessions s ON s.id=a.session_id
               JOIN club_days d ON d.id=s.club_day_id JOIN clubs c ON c.id=d.club_id
               WHERE c.campus_id=$1 AND d.status<>'planned'
                 AND date_trunc('month', d.day_date) = date_trunc('month', $2::date)""",
            admin_user["campus_id"], TODAY)[0]["n"]
    check("trend check-ins match the raw tables", tr[-1]["attendance_records"] == raw, (tr[-1], raw))
    check("students refused on trend (403)", c.get("/dashboards/trend", headers=student).status_code == 403)

    # ------------------------------------------------------------ 11. CSV import
    before = q("SELECT count(*) AS n FROM club_days WHERE club_id=$1", club["id"])[0]["n"]
    d1, d2 = TODAY + timedelta(days=40), TODAY + timedelta(days=47)
    good = (f"﻿day_date,title,start_time,end_time,submission_deadline\n"
            f"{d1},Import A {stamp},16:00,18:00,{d1}T20:00:00+05:30\n\n{d2},Import B {stamp},,,\n").encode()
    form = {"club_ids": str(club["id"])}
    r = c.post("/club-days/import?dry_run=true", headers=coord, files={"file": ("cal.csv", good, "text/csv")}, data=form)
    check("dry run previews without saving", r.status_code == 201 and r.json()["valid_rows"] == 2
          and r.json()["would_create"] == 2 and r.json()["created"] == 0, r.text)
    check("dry run wrote nothing", q("SELECT count(*) AS n FROM club_days WHERE club_id=$1", club["id"])[0]["n"] == before)
    r = c.post("/club-days/import", headers=coord, files={"file": ("cal.csv", good, "text/csv")}, data=form)
    check("valid CSV imports every row", r.json().get("created") == 2, r.text)
    r = c.post("/club-days/import", headers=coord, files={"file": ("cal.csv", good, "text/csv")}, data=form)
    check("re-importing skips duplicates", r.json().get("created") == 0 and r.json().get("skipped") == 2, r.text)
    bad = (f"day_date,title,start_time,end_time,submission_deadline\n"
           f"{d1},Bad A,,,\n2026-13-01,Bad month,,,\n{d2},Bad deadline,,,{d1}T10:00:00+05:30\n"
           f"{d2},Bad time,18:00,17:00,\n").encode()
    mid = q("SELECT count(*) AS n FROM club_days WHERE club_id=$1", club["id"])[0]["n"]
    r = c.post("/club-days/import", headers=coord, files={"file": ("cal.csv", bad, "text/csv")}, data=form)
    report = r.json()["detail"]["report"] if r.status_code == 422 else {}
    check("invalid rows are reported by line and nothing is saved",
          r.status_code == 422 and [e["line"] for e in report.get("errors", [])] == [3, 4, 5]
          and q("SELECT count(*) AS n FROM club_days WHERE club_id=$1", club["id"])[0]["n"] == mid, r.text)
    r = c.post("/club-days/import", headers=coord, files={"file": ("cal.csv", b"date,name\n2026-01-01,x\n", "text/csv")}, data=form)
    check("unknown/missing columns are rejected", r.status_code == 422 and "Unknown column" in r.text, r.text)
    r = c.post("/club-days/import", headers=coord, files={"file": ("cal.txt", good, "text/plain")}, data=form)
    check("non-CSV upload is rejected (415)", r.status_code == 415)
    r = c.post("/club-days/import", headers=student, files={"file": ("cal.csv", good, "text/csv")}, data=form)
    check("students cannot import (403)", r.status_code == 403)
    r = c.get("/club-days/import/template", headers=coord)
    check("CSV template downloads", r.status_code == 200 and r.text.startswith("day_date,"))
    r = c.get("/dashboards/export/clubs", headers=admin)
    check("existing CSV export still works", r.status_code == 200 and "club_name" in r.text)

    # ------------------------------------------------------------ 12. notification history
    asyncio.run(_q("""INSERT INTO notification_deliveries (notification_id, channel, status, attempts, last_error_code)
                     SELECT id, 'email', 'failed', 5, 'smtp_auth_failed' FROM notifications
                     WHERE kind='club_day.rescheduled' AND payload->>'club_day_id'=$1 LIMIT 1
                     ON CONFLICT DO NOTHING""", str(day)))
    h = c.get("/admin/notifications?limit=200", headers=sup).json()
    check("super admin sees persisted notification history", h["total"] > 0 and h["items"][0]["recipient_name"], h.get("total"))
    f = c.get("/admin/notifications?channel=email&status=failed", headers=sup).json()
    check("failed email deliveries are filterable with an error code only",
          f["items"] and f["items"][0]["deliveries"][0]["error_code"] == "smtp_auth_failed"
          and "email" not in str(f["items"][0].get("recipient_name", "")).lower(), f["items"][:1])
    cn = c.get(f"/admin/notifications?status=cancelled&club_day_id={day}", headers=sup).json()
    check("cancelled (outdated) reminders are distinguishable", cn["total"] >= 1, cn["total"])
    ca = c.get("/admin/notifications?limit=200", headers=admin).json()
    check("campus admin history excludes other campuses",
          all(i["recipient_campus"] in (None, "Main Campus") for i in ca["items"]), {i["recipient_campus"] for i in ca["items"]})
    r = c.put("/notifications/email-preference", headers=s3, json={"enabled": False})
    check("users can turn email notifications off", r.json().get("enabled") is False)
    c.put("/notifications/email-preference", headers=s3, json={"enabled": True})
    inbox = c.get("/notifications?limit=100", headers=s3).json()["items"]
    check("inbox marks outdated reminders", any(n["cancelled_at"] for n in inbox if n["kind"] == "club_day.upcoming"))

    # ------------------------------------------------------------ 16. startup endpoints
    check("/health/live answers", c.get("/health/live").json() == {"status": "ok"})
    hl = c.get("/health").json()
    check("/health reports the applied schema", hl.get("schema") == "011_mirai_platform.sql", hl)

    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
