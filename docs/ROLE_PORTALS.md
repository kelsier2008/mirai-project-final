# Role portals

Mirai's frontend is five separate static sites, one per role. They share one source tree
(`frontend/shared/`) and one backend API, and each is built and deployed on its own
(see [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md)).

| Portal | Folder | Canonical role (`permissions.py`) | Label in the UI | Purpose |
|---|---|---|---|---|
| Super Admin Portal | `frontend/apps/super-admin` | `super_admin` | Super admin | Program administration across every campus |
| Campus Manager Portal | `frontend/apps/campus-manager` | `campus_admin` | Campus manager | Administration of one campus |
| Advisor Portal | `frontend/apps/advisor` | `advisor` | Faculty advisor | Plan approval and oversight for advised clubs |
| Coordinator Portal | `frontend/apps/coordinator` | `coordinator` | Club coordinator | Running the clubs they coordinate |
| Student Portal | `frontend/apps/student` | `student` | Student | Clubs, check-in, submissions and records |

The role strings, JWT claims and database values are unchanged. Only the display label of
`campus_admin` changed, from "Campus admin" to "Campus manager" (`GET /config/public`).

**The backend is the source of truth for permissions.** A portal checks the signed-in role
only so that people see the right interface. Every API request is still authorised by the
server: `current_user` validates the token, `require_permission`/`require_role` check the
role against `ROLE_PERMISSIONS`, and `assert_club_access` plus the SQL helpers in
`app/core/scoping.py` limit rows to the user's campus or clubs. A separate URL grants
nothing. The E2E suite (`frontend/e2e/authorization.spec.mjs`) calls the API around the
portals with each role's token, and with forged tokens, and checks that the server refuses.

## 1. Audit of the single-file frontend (before the split)

Recorded from the code at commit `ad92ea4`. The old file is in Git history as
`frontend/index.html`.

**Architecture.** It was one 744-line, 158 KB HTML file: 39 KB of CSS and 118 KB of vanilla
JavaScript, with no build step. It used hash routing (`#/Page?param=…`). A `TABS` object
listed each role's pages, and a `P` object mapped page names to render functions. Several
pages branched on `me.role` (Home, Clubs, Days, Check-in, Certs, Events, Records), so
student and staff code shared the same functions. `qrcodejs` was loaded from cdnjs on
every page load. The Render static site injected `window.CLUB_TRACKER_API` through
`scripts/build_public_frontend.py`. Otherwise the API address was the page's host on
port 8000, or a `localStorage` override set from "Connection settings".

**Authentication flow.**
1. `POST /auth/login` with `{identifier, password}`, where identifier is an email or a
   student code. It returns `{access_token, token_type, user}`, and `user` is the
   server-side profile with `permissions`.
2. The token is an HS256 JWT valid for 8 hours (`sub`, `role`, `campus_id`). It was stored
   in `sessionStorage['t']` and sent as `Authorization: Bearer …`.
3. On load, `GET /auth/me` returns the profile. The server returns 401 if the account's
   role or campus no longer matches the token.
4. Any 401 on a signed-in request cleared the session and showed sign-in ("Your session
   has ended").
5. One sign-in page served every role. The role from the server chose which `TABS` to show.

**Navigation per role (`TABS`):**

| Role | Pages, in order |
|---|---|
| student | Home, Clubs, Days, Check-in, Submit, Certs, Events, Records, Notifications |
| coordinator | Home, Members, Days, Check-in, Grading, Certs, Events, Budgets, Dashboard, Notifications |
| advisor | Home, Days, Check-in, Grading, Certs, Events, Budgets, Dashboard, Notifications |
| campus_admin, super_admin | Dashboard, Administration, Clubs, Members, Days, Check-in, Grading, Certs, Events, Budgets, Duty Leave, Records, Notification log, Notifications |

Each portal keeps exactly its role's list, in the same order (tested in
`frontend/tests/portals.test.mjs`).

**Permissions (`backend/app/core/permissions.py`).** Admin roles (`campus_admin`,
`super_admin`) hold `user.manage`, `club.create/edit/approve/deactivate/delete`,
`club.coordinators`, `event.manage/reschedule`, `budget.decide`, `duty_leave.decide`,
`transcript.view_any` and `notification.history`. Only `super_admin` holds `campus.create`.
Club managers (coordinator plus the admin roles) hold `membership.decide`, `club_day.create`,
`club_day.plan.edit`, `club_day.transition`, `club_day.reschedule`, `club_day.import`,
`checkin.run` and `submission.grade`. Plan approval (`club_day.plan.decide`) belongs to the
advisor and the admin roles. Staff (all four non-student roles) hold `checkin.view`,
`submission.view_all`, `budget.request` and `dashboard.view`. Students hold `club.join`,
`checkin.scan`, `submission.create`, `event.register` and `club.view`.

Row-level scope: a super admin sees every campus; a campus admin sees only their campus
(`campus_id`). A coordinator sees only clubs in `club_coordinators`, an advisor only clubs
where `advisor_id` is them, and a student only their own rows.

**Cross-role dependencies found in the code.**
- The staff Home page uses the Club Day plan and review dialogs.
- The Clubs, Days, Check-in, Certs, Events and Records pages each had a student branch and
  a staff branch in one function.
- Global search chose its target page from `TABS`.
- The Dashboard and Administration pages contained super-admin-only cards (campus
  comparison, campus creation) behind role and permission checks.

**Tests and commands found.** These were `python -m pytest backend/tests/unit` (67
tests), the smoke scripts `backend/scripts/smoke*.py` run inside the API container,
`loadtest/run.sh`, and `scripts/run_local.sh [--demo]` for local mode. There were no
frontend tests.

## 2. What each portal contains

Each row is a page. Cells name the module that renders it in that portal; a dash means the
page is not part of that portal and is not in its build. Module paths are relative to
`frontend/shared/features/`.

| Page | Super Admin | Campus Manager | Advisor | Coordinator | Student | API used |
|---|---|---|---|---|---|---|
| Home | – | – | `home/staff-home` | `home/staff-home` | `home/student-home` | staff: `GET /club-days`, `/checkin/sessions?status=live`; student: `/club-days?upcoming`, `/memberships/me`, `/checkin/attendance/me`, `/notifications` |
| Dashboard | `dashboard/dashboard` + `campus-comparison` | `dashboard/dashboard` | `dashboard/dashboard` | `dashboard/dashboard` | – | `/dashboards/summary, trend, clubs, monthly-report, inactive-clubs, zero-participation, top-contributors, students, export/*`; super admin also `/dashboards/campuses` |
| Administration | `admin/administration` + `admin/campus-create` | `admin/administration` | – | – | – | `GET/POST /users`, `GET /campuses`; super admin also `POST /campuses` |
| Clubs | `clubs/club-registry` | `clubs/club-registry` | – | – | `clubs/student-clubs` | registry: `/clubs` CRUD, `/decision`, `/status`, `/coordinators`, `/users?role=`; student: `GET /clubs`, `/memberships/me`, `POST /clubs/{id}/join` |
| Members | `clubs/membership-requests` | same | – | same | – | `GET /clubs/{id}/memberships`, `POST /memberships/{id}/decision` |
| Days | `club-days/planner` | same | same | same | `club-days/student-days` | planner: `/club-days` (create, plan, plan decision, reschedule, presenters, transition, import); student: `GET /club-days` |
| Check-in | `checkin/staff-checkin` | same | same | same | `checkin/student-checkin` | staff: `/checkin/club-days/{id}/open`, `/checkin/sessions…` (qr, roster, close, corrections); student: `POST /checkin/scan`, `/checkin/attendance/me` |
| Submit | – | – | – | – | `submissions/student-submit` | `/club-days/{id}/submissions` (file, link, list), `/submissions/{id}/download` |
| Grading | `submissions/grading` | same | same | same | – | `/club-days/{id}/grading-roster`, `PUT /submissions/{id}/evaluation` |
| Certs | `certificates/staff-certificates` | same | same | same | `certificates/student-certificates` | staff: `/club-days/{id}/certificates…`, `/certificates/achievement`, `/certificates/{id}/revoke`; student: `/certificates/me`, `POST /certificates/participation`; both `/certificates/{id}/download` and the API's public `/verify/{id}` |
| Events | `events/events-page` + `staff-events` | same | same | same | `events/events-page` + `student-events` | common: `/events`, `/events/{id}`, results, media; staff: create, approve, reschedule, registrations, check-in, results, certificates, moderation; student: register, teams, claim certificate, photo upload |
| Budgets | `budgets/budgets` | same | same | same | – | `GET/POST /budgets`, `POST /budgets/{id}/decision` |
| Duty Leave | `duty-leave/duty-leave` | same | – | – | – | `GET /duty-leave`, `POST /duty-leave/{id}/decision` |
| Records | `records/transcript-lookup` | same | – | – | `records/student-records` | staff: `GET /transcripts/{ref}`; student: `/transcripts/me`, `.csv`, `/download`, `POST /api/transcripts/verify` |
| Notification log | `notifications/notification-log` | same | – | – | – | `GET /admin/notifications` |
| Notifications | `notifications/inbox` | same | same | same | same | `/notifications`, read, read-all, email and WhatsApp preferences |

Pages used by several portals are one module. What each user may do on them is decided by
the server's permissions, and the controls follow `me.permissions` (`can(...)`). For
example, an advisor's Days page shows "Review plan" but no lifecycle buttons, and a
coordinator's Events page is read-only. Inside the shared admin pages the super admin still
gets a campus picker when creating clubs, events and accounts, as before.

The build publishes only the modules a portal imports. The Student Portal build contains
no staff or admin module, the Advisor and Coordinator builds contain no admin module, and
the Campus Manager build contains neither campus creation nor the campus comparison. These
boundaries are tested in `frontend/tests/portals.test.mjs` and `build.test.mjs`.

## 3. Source layout

```text
frontend/
├── index.html                 local development launcher (links to the five portals; never deployed)
├── apps/<portal>/             one folder per portal
│   ├── index.html             entry page: shared stylesheet, theme script, portal.js
│   ├── portal-config.js       portal id, expected role, labels, page list (navigation order)
│   ├── pages.js               page id -> renderer; the only place a portal picks its features
│   └── portal.js              startPortal(portalConfig, pages)
├── shared/                    the single source of truth for everything else
│   ├── config/portals.js      the five portals and their canonical roles
│   ├── config/runtime-config.js  deployment settings (development defaults; replaced by each build)
│   ├── core/                  api.js (HTTP, errors, downloads), state.js (session state), dom.js,
│   │                          format.js, theme.js, validation.js
│   ├── components/            ui.js (cards, tables, pills, buttons), forms.js, dialogs.js,
│   │                          charts.js, clipboard.js, brand.js
│   ├── navigation/            router.js (hash routes limited to the portal's pages), search.js, page-meta.js
│   ├── auth/                  session.js (sign-in, role check, token storage), login-view.js,
│   │                          role-mismatch-view.js
│   ├── app/                   portal-runtime.js (boot, sign-out, expiry), shell.js (sidebar, top bar)
│   ├── features/<area>/       page modules (see the table above)
│   ├── styles/app.css         the original stylesheet, unchanged, plus one rule for link buttons
│   └── theme-init.js          applies the saved theme before first paint
├── scripts/build-portal.mjs   builds one portal (Node 18+, no npm packages)
├── scripts/serve.mjs          serves builds locally with their _headers (preview and tests)
├── tests/                     node --test: portal config, module boundaries, build script
└── e2e/                       Playwright: all five portals against a real API
```

Dependencies only point downwards (core → components → navigation → features → app), and
there are no import cycles (tested). Modules have no side effects at import time, which is
why the tests can import every portal's `pages.js` in Node.

The code inside each page module was moved from the old `index.html` by exact line ranges.
The changes made were splitting the student and staff branches into separate modules,
reading session state through `core/state.js`, and the items listed under section 5.

## 4. Sign-in and the role check

`frontend/shared/app/portal-runtime.js` and `auth/session.js`:

1. **Sign in.** The portal calls the existing `POST /auth/login`, with the same request,
   response and error messages as before.
2. **Wrong role.** If `user.role` is not the portal's `expectedRole`, the token is thrown
   away unused and the role-mismatch screen is shown. It says which portal the account
   belongs to, links to it when its address is configured (`MIRAI_PORTAL_URL_*`), and
   offers **Sign out**, which returns to this portal's sign-in.
3. **Right role.** The token is stored in `sessionStorage` under `mirai:<portal>:token`
   (one tab, one portal), and the portal shell opens.
4. **Reload.** The stored token is checked with `GET /auth/me`. A 401 (expired, invalid or
   changed account) ends the session with "Your session has ended. Please sign in again." A
   different role shows the mismatch screen and clears the token. A network failure shows
   a readable message and keeps the token for a later retry.
5. **Navigation.** A page name in the URL that is not in the portal's list falls back to
   the portal's home page.
6. **Sign out** clears the session storage, stops polling timers and shows the sign-in screen.

Demo logins appear only in development (the unbuilt source) or in builds made with
`--demo-accounts` or `MIRAI_DEMO_ACCOUNTS=1`. "Connection settings" (an API address override)
exists only in development.

## 5. Behaviour changes, and why

| Change | Reason |
|---|---|
| Each portal accepts only its own role | The requirement of this split. The server still enforces permissions. |
| Portal-specific sign-in heading, intro, field label and console label (for example "Coordinator console" instead of "Admin console") | So people can tell which portal they are on |
| `campus_admin` is labelled "Campus manager" (backend `/config/public` and the account-role filter) | Requested wording. The role key is unchanged. |
| Tokens are stored under a per-portal key | Two portals served from one origin in development must not share a session |
| A 401 during start-up now keeps its "session has ended" message | The old start-up code re-rendered the sign-in screen and lost the message |
| `qrcodejs` loads only when a staff member shows a live QR, with a Subresource Integrity hash | Students and the advisor never need it; SRI blocks a modified file |
| Builds send a Content-Security-Policy and other security headers (`_headers`) | Limits where scripts can come from and where data can be sent |
| No demo logins and no API override in production builds | Requirement: no demo credentials on production pages |
| The API address is fixed at build time; there is no `localhost` fallback in builds | Requirement: no hardcoded development address in production |
