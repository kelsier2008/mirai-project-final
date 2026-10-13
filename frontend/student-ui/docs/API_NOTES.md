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

All club-tracker screens call the real API through `src/api/services.ts`. Only the screens the
backend has no data for use mock data (marked `TODO(api)` in `src/data/mock.ts`).

| Route | Screen | Source |
|---|---|---|
| sidebar, "Hello, <name>" | profile | **API** `GET /auth/me` |
| program / batch / semester | academic profile | **mock** (no field on `/auth/me`) |
| `/` Home, Events card | upcoming Club Days | **API** `/club-days?upcoming=true` + `/checkin/attendance/me` (empty state when none) |
| `/` Home, Attendance donut | present vs absent | **API (derived)** from past Club Days and check-ins |
| `/` Home, Highlights | banners | **mock** placeholder art |
| `/calendar` | Club Days table | **API** `GET /club-days` |
| `/community` Clubs tab | join clubs, memberships | **API** `GET /clubs`, `GET /memberships/me`, `POST /clubs/{id}/join` |
| `/community?tab=events` | events, teams, results, gallery | **API** `/events/**` |
| `/attendance` | check-in + history | **API** `/checkin/sessions/{id}`, `POST /checkin/scan`, `/checkin/attendance/me` |
| `/submit` | submissions | **API** `/club-days/{id}/submissions[/file\|/link]`, `/submissions/{id}/download` |
| `/certificates` | claim and download | **API** `/certificates/me`, `POST /certificates/participation`, `/certificates/{id}/download` |
| `/records` | transcript + verify | **API** `/transcripts/me[.csv\|/download]`, `POST /api/transcripts/verify` |
| `/notifications` | inbox, email and WhatsApp prefs | **API** `/notifications/**` |
| `/courses` My Subjects, pending assignments | subjects | **mock** (backend has no subjects or assignments) |
| `/help` Help & FAQs | FAQs | **mock** |
| `/fees`, `/academy`, `/courses/:id` | stubs | none |

Verified on 2026-10-13 against this repo's backend (Docker, seeded demo data): sign-in, every route
above loading without console errors, and joining a club. Flows needing staff-created data
(check-in scan, submissions, certificates, event registration) are implemented from the same
contracts as the old portal but have not been exercised end to end.
