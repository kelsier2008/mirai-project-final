# Mirai student portal UI

React + TypeScript + Vite + Tailwind v4 rebuild of the student portal screens (Home, Help & FAQs,
My Subjects) on top of the existing Mirai API. The other four role portals are untouched.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + static build into dist/
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://club-tracker-demo-api.onrender.com` | The shared Mirai API. Also sets `connect-src` in the generated `_headers`. |

Copy `.env.example` to `.env.local` to override. No secrets, tokens or demo logins live in the code.

## Structure

```
src/
  api/         client.ts (the only fetch), services.ts (typed calls), types.ts, config.ts
  components/  Sidebar, Topbar, AppShell, Card, Pill, Donut, Accordion, EventCard, SubjectCard, ...
  pages/       Home, Help, Subjects, Login, Stub (route stubs + /courses/:id)
  data/        mock.ts, typed placeholder data
  styles/      tokens.css (@theme colors, radii, shadows), index.css
  lib/         auth context (token, role check, logout), useAsync (loading/error/ready)
docs/API_NOTES.md   endpoints, auth flow and which data feeds which screen
```

Components never call `fetch`; pages call `src/api/services.ts`. Every API-driven card has a
skeleton, an error state with retry, and (where the API lacks the data) a mock fallback.

## Swapping mock data for the real API

Each mock-backed function in `src/api/services.ts` (`getSubjects`, `getAssignments`, `getFaqs`,
`getHighlights`, `getAcademicProfile`) returns `{ data, source: 'mock' }`. Replace its body with
`request<T>('GET', '/your/endpoint')`, map the response to the types in `src/api/types.ts`, and
return `{ data, source: 'api' }`. Search for `TODO(api)` to find every placeholder. See
`docs/API_NOTES.md` for what the current backend does and does not provide.

## Deploy to Cloudflare Pages (Direct Upload)

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
npx wrangler pages deploy dist --project-name <your-pages-project>
```

or upload the `dist/` folder in the Pages dashboard. The build writes `dist/_headers` (CSP, no-sniff,
frame denial, referrer and permissions policies, same as the existing portals) with `connect-src`
pinned to your API origin. The API's `CORS_ORIGINS` must include the Pages URL. Routes use the
History API; Pages serves `index.html` for unknown paths when there is no `404.html`.
