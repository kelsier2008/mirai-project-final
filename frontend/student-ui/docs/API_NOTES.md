# Student portal: API notes

Source of truth: the existing student portal source in this repo (`frontend/apps/student`,
`frontend/shared/**`) and the FastAPI routers in `backend/app/routers`. The repo here holds
the portal as source (the GitHub copy described as "compiled builds" is built from it with
`frontend/scripts/build-portal.mjs`), so these notes were read from code, not reverse
engineered from minified bundles. Nothing was captured from the live network tab: confirm
against the deployed API if it has drifted.

Base URL: `https://club-tracker-demo-api.onrender.com` (env `VITE_API_BASE_URL`). All
requests are JSON; errors are `{detail: string | [{loc,msg}]}`.

## Authentication

1. `POST /auth/login` body `{identifier, password}` (identifier = email or student code).
   Response `{access_token, token_type: "bearer", user}`; `user` is the profile below.
   401 `Invalid credentials` on failure. There are no demo logins in production builds.
2. Token: HS256 JWT, claims `sub`, `role`, `campus_id`, 8h expiry. Stored in
   `sessionStorage['mirai:student:token']` (this tab only; same key as the old portal).
3. Every request sends `Authorization: Bearer <token>`.
4. On load, `GET /auth/me` returns the profile (401 if role/campus changed since the token
   was issued). The UI trusts this response, not storage.
5. Role check: the portal accepts only `role === "student"`; other roles are refused
   client-side (the server independently authorises every route).
6. Any 401 on a signed-in request clears the session and shows the login screen with
   "Your session has ended". Log Out clears the token and `sessionStorage`.

Profile (`/auth/me`, `login.user`): `{id, role, campus_id, name, email, student_code, campus_name, permissions[]}`.

## Endpoints the student portal calls

| Method + path | Role | Response (subset) |
|---|---|---|
| `GET /config/public` | public | `{app_name, app_short_name, institution_name, role_labels}` (branding only; not used by this UI) |
| `GET /auth/me`, `POST /auth/login` | any | see above |
| `GET /club-days?upcoming=true` | student | `[{id, club_id, club_name, title, plan_topic, plan_venue, day_date, start_time, end_time, status, submission_deadline, schedule_version}]` for the student's approved clubs |
| `GET /club-days` | student | same, all dates |
| `GET /checkin/attendance/me` | student | `[{id, session_id, club_day_id, checked_in_at, is_late, geo_flag, corrected, day_date, start_time, title, club_name}]` |
| `GET /checkin/sessions/{id}`, `POST /checkin/scan` | student | check-in flow (old portal only) |
| `GET /memberships/me`, `GET /clubs`, `POST /clubs/{id}/join` | student | clubs (old portal only) |
| `GET /events`, `POST /events/{id}/register` | student | events (old portal only) |
| `GET /notifications?limit=` | any | `{unread_count, items[]}` (old portal only) |
| `GET /certificates/me`, `GET /transcripts/me` | student | certificates / record (old portal only) |

"Old portal only" = used by `frontend/apps/student` but not by this UI yet.

## Data feeding each screen of this UI

| Screen / card | Source | Notes |
|---|---|---|
| Sidebar user block, "Hello, <name>" | **API** `GET /auth/me` | initials from `name` |
| Program / batch / semester ("BTECH · 2026-30", "Semester 1") | **mock** | API has no program/semester; `getAcademicProfile` |
| Home → Events | **API** `/club-days?upcoming=true` + `/checkin/attendance/me` | Club Days mapped to event cards (first 3); mock if empty/failed. Tag "Lecture" becomes "Club Day" for real data |
| Home → Attendance donut | **API (derived)** | present = past Club Days with a check-in; absent = past Club Days without one; mock 90/10 when there is no history |
| Home → Highlights | **mock** | placeholder SVG banners |
| Help & FAQs | **mock** | no FAQ endpoint; placeholder answers |
| My Subjects, Pending assignments | **mock** | the backend is a club tracker: no subjects or assignments exist |
| Calendar, Community, My Attendance, Fee Payment, Mirai Academy | stubs | no data |

Mock fallbacks live in `src/data/mock.ts` and `src/api/services.ts`, each marked `TODO(api)`.
