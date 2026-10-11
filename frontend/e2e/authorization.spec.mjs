// The portals' role checks are for the user's benefit only. These tests go around the
// frontend and show that the API itself refuses every out-of-role or out-of-scope call.
import {API, DEMO, portalUrl} from './env.mjs';
import {apiAs, apiToken, expect, signedIn, test} from './fixtures.mjs';

const refused = [401, 403];

test('a student token cannot reach staff or admin endpoints', async ({request}) => {
  const s = apiAs(request, await apiToken(request, DEMO.student));
  const calls = [
    ['post', '/campuses', {name: 'Nope'}], ['get', '/users'], ['post', '/users', {}], ['get', '/admin/notifications'],
    ['post', '/clubs', {name: 'Nope', capacity: 1}], ['post', '/club-days', {club_id: 1, day_date: '2030-01-01'}],
    ['get', '/dashboards/summary'], ['get', '/dashboards/export/clubs'], ['get', '/duty-leave'], ['get', '/budgets'],
    ['get', '/transcripts/S002'], ['get', '/checkin/sessions'], ['get', '/clubs/1/memberships'],
  ];
  for (const [method, path, body] of calls) {
    const r = await s[method](path, body);
    expect(refused, `${method.toUpperCase()} ${path} -> ${r.status()}`).toContain(r.status());
  }
});

test('a coordinator token stays inside its own clubs and has no admin rights', async ({request}) => {
  const c = apiAs(request, await apiToken(request, DEMO.coordinator));
  const admin = apiAs(request, await apiToken(request, DEMO['campus-manager']));
  const coding = (await (await admin.get('/clubs')).json()).find(x => x.name === 'Coding Club');
  expect(coding, 'seeded Coding Club').toBeTruthy();
  expect((await c.get(`/clubs/${coding.id}/memberships`)).status(), 'not a coordinator of Coding Club').toBe(403);
  for (const [method, path, body] of [
    ['post', '/campuses', {name: 'Nope'}], ['get', '/users'], ['get', '/admin/notifications'],
    ['get', '/transcripts/S001'], ['post', '/budgets/1/decision', {decision: 'approve'}], ['get', '/duty-leave'],
  ]) expect(refused, `${path}`).toContain((await c[method](path, body)).status());
  const visible = (await (await c.get('/clubs')).json()).map(x => x.name);
  expect(visible).not.toContain('Coding Club');
});

test('an advisor token can review but not run check-in or decide memberships', async ({request}) => {
  const a = apiAs(request, await apiToken(request, DEMO.advisor));
  expect((await a.post('/checkin/club-days/1/open', {})).status()).toBe(403);
  expect((await a.post('/memberships/1/decision', {decision: 'approve'})).status()).toBe(403);
  expect((await a.post('/club-days', {club_id: 1, day_date: '2030-01-01'})).status()).toBe(403);
  expect((await a.get('/dashboards/summary')).status()).toBe(200);
});

test('a campus manager token cannot create campuses or see another campus', async ({request}) => {
  const m = apiAs(request, await apiToken(request, DEMO['campus-manager']));
  expect((await m.post('/campuses', {name: 'Nope'})).status()).toBe(403);
  const r = await m.post('/users', {name: 'X', email: `x-${Date.now()}@example.test`, password: 'long-enough-pw', role: 'super_admin'});
  expect(r.status(), 'campus managers cannot create admin accounts').toBe(403);
  const users = await (await m.get('/users')).json();
  expect(users.every(u => u.campus_name === 'Main Campus'), 'directory is campus-scoped').toBe(true);
});

test('forged or altered tokens are rejected', async ({request}) => {
  const token = await apiToken(request, DEMO.student);
  const [head, body] = token.split('.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const promoted = `${head}.${b64({...claims, role: 'super_admin', campus_id: null})}.${token.split('.')[2]}`;
  const unsigned = `${b64({alg: 'none', typ: 'JWT'})}.${b64({...claims, role: 'super_admin'})}.`;
  for (const forged of [promoted, unsigned, 'not-a-token']) {
    expect((await apiAs(request, forged).get('/users')).status()).toBe(401);
    expect((await apiAs(request, forged).get('/auth/me')).status()).toBe(401);
  }
});

test('inside the Student Portal, calling admin endpoints directly is refused', async ({page, allowConsole}) => {
  allowConsole(/status of 403/);
  await signedIn(page, 'student');
  const statuses = await page.evaluate(async api => {
    const auth = {Authorization: 'Bearer ' + sessionStorage.getItem('mirai:student:token')};
    const call = async (path, init = {}) => (await fetch(api + path, {...init, headers: {...auth, 'Content-Type': 'application/json'}})).status;
    return {
      users: await call('/users'),
      campus: await call('/campuses', {method: 'POST', body: JSON.stringify({name: 'Nope'})}),
      dashboard: await call('/dashboards/summary'),
    };
  }, API);
  expect(statuses).toEqual({users: 403, campus: 403, dashboard: 403});
  // And there is no admin screen to open by URL.
  await page.goto(portalUrl('student') + '#/Administration');
  await expect(page).toHaveURL(/#\/Home$/);
});
