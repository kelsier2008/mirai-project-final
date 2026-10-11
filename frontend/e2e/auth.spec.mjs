// Sign-in, sign-out, role checks and session handling in each portal.
import {API, DEMO, OFFLINE_URL, OUTSIDER_URL, PORTAL_IDS, ROLE, TITLE, portalUrl} from './env.mjs';
import {apiToken, expect, signIn, signedIn, test} from './fixtures.mjs';

const NAV = {
  student: ['Home', 'Clubs', 'Days', 'Check-in', 'Submit', 'Certs', 'Events', 'Records', 'Notifications'],
  coordinator: ['Home', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications'],
  advisor: ['Home', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications'],
  'campus-manager': ['Dashboard', 'Administration', 'Clubs', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Duty Leave', 'Records', 'Notification log', 'Notifications'],
};
NAV['super-admin'] = NAV['campus-manager'];
const tokenKey = portal => `mirai:${portal}:token`;
const storedToken = (page, portal) => page.evaluate(k => sessionStorage.getItem(k), tokenKey(portal));
// Someone of a different role for each portal.
const WRONG = {'super-admin': 'student', 'campus-manager': 'super-admin', advisor: 'coordinator', coordinator: 'student', student: 'coordinator'};

for (const portal of PORTAL_IDS) {
  test.describe(TITLE[portal], () => {
    test('shows its own sign-in screen without demo logins or API override', async ({page}) => {
      await page.goto(portalUrl(portal));
      await expect(page.getByRole('heading', {name: `Sign in to the ${TITLE[portal]}`})).toBeVisible();
      await expect(page.locator('.demo-area')).toHaveCount(0);
      await expect(page.locator('.api-setting')).toHaveCount(0);
      await expect(page.locator('#nav')).toHaveCount(0);
    });

    test('signs in its own role, shows only its pages, and signs out', async ({page}) => {
      await signedIn(page, portal);
      expect(await page.locator('#nav button').evaluateAll(bs => bs.map(b => b.dataset.page))).toEqual(NAV[portal]);
      await expect(page.locator('#pageTitle')).toContainText('Good');
      expect(await storedToken(page, portal)).toBeTruthy();
      const me = await page.evaluate(async ([api, k]) => (await fetch(api + '/auth/me', {headers: {Authorization: 'Bearer ' + sessionStorage.getItem(k)}})).json(), [API, tokenKey(portal)]);
      expect(me.role).toBe(ROLE[portal]);

      // A page from another portal cannot be opened by URL: it falls back to home.
      const foreign = portal === 'student' ? 'Administration' : 'Submit';
      await page.goto(portalUrl(portal) + '#/' + encodeURIComponent(foreign));
      await expect(page.locator('#nav')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#/${encodeURIComponent(NAV[portal][0])}$`));
      await expect(page.locator(`#nav button[data-page="${NAV[portal][0]}"]`)).toHaveAttribute('aria-current', 'page');

      // The session survives a reload (it is re-checked with /auth/me).
      await page.reload();
      await expect(page.locator('#nav')).toBeVisible();

      await page.getByRole('button', {name: 'Sign out'}).click();
      await expect(page.getByRole('button', {name: 'Continue to workspace'})).toBeVisible();
      expect(await storedToken(page, portal)).toBeNull();
      await page.reload();
      await expect(page.getByRole('button', {name: 'Continue to workspace'})).toBeVisible();
    });

    test('turns away an account of another role and offers sign-out', async ({page}) => {
      const other = WRONG[portal];
      await signIn(page, portal, DEMO[other]);
      await expect(page.getByRole('heading', {name: `This is the ${TITLE[portal]}`})).toBeVisible();
      await expect(page.getByText('Wrong portal')).toBeVisible();
      await expect(page.locator('#nav')).toHaveCount(0);
      await expect(page.locator('#view')).toHaveCount(0);
      expect(await storedToken(page, portal), 'the token of a mismatched account is never kept').toBeNull();
      await expect(page.getByRole('link', {name: `Open the ${TITLE[other]}`})).toHaveAttribute('href', portalUrl(other));
      await page.getByRole('button', {name: 'Sign out'}).click();
      await expect(page.getByRole('heading', {name: `Sign in to the ${TITLE[portal]}`})).toBeVisible();
    });

    test('a stored token for another role is rejected on load', async ({page, request}) => {
      const token = await apiToken(request, DEMO[WRONG[portal]]);
      await page.addInitScript(([k, t]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem(k, t); sessionStorage.setItem('seeded', '1'); } }, [tokenKey(portal), token]);
      await page.goto(portalUrl(portal));
      await expect(page.getByRole('heading', {name: `This is the ${TITLE[portal]}`})).toBeVisible();
      await expect(page.locator('#nav')).toHaveCount(0);
      expect(await storedToken(page, portal)).toBeNull();
    });
  });
}

test('wrong password shows the API message and stores nothing', async ({page}) => {
  await signIn(page, 'student', DEMO.student, 'not-the-password');
  await expect(page.locator('.form-error')).toHaveText('Invalid credentials');
  await expect(page.locator('#nav')).toHaveCount(0);
  expect(await storedToken(page, 'student')).toBeNull();
});

test('an expired or invalid stored token ends the session with a message', async ({page}) => {
  await page.addInitScript(k => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem(k, 'expired.or.invalid'); sessionStorage.setItem('seeded', '1'); } }, tokenKey('coordinator'));
  await page.goto(portalUrl('coordinator'));
  await expect(page.locator('.notice', {hasText: 'Your session has ended. Please sign in again.'})).toBeVisible();
  await expect(page.locator('#nav')).toHaveCount(0);
});

test('a token that expires mid-session returns to sign-in', async ({page}) => {
  await signedIn(page, 'advisor');
  await page.evaluate(k => sessionStorage.setItem(k, 'tampered'), tokenKey('advisor'));
  await page.reload();
  await expect(page.locator('.notice', {hasText: 'Your session has ended'})).toBeVisible();
});

test('an unreachable API gives a readable message', async ({page, allowConsole}) => {
  allowConsole(/ERR_CONNECTION_REFUSED|Failed to load resource|request to http:\/\/127\.0\.0\.1:9$/);
  await page.goto(OFFLINE_URL);
  await page.locator('input[name=identifier]').fill(DEMO.student);
  await page.locator('input[name=password]').fill('password123');
  await page.getByRole('button', {name: 'Continue to workspace'}).click();
  await expect(page.locator('.form-error')).toHaveText('Cannot reach the server at http://127.0.0.1:9. Check your connection and try again.');
});

test('each portal keeps its own session (separate origins)', async ({page}) => {
  await signedIn(page, 'student');
  await page.goto(portalUrl('coordinator'));
  await expect(page.getByRole('heading', {name: 'Sign in to the Coordinator Portal'})).toBeVisible();
  await page.goto(portalUrl('student'));
  await expect(page.locator('#nav')).toBeVisible();
});

test('the API only answers browsers on the listed portal origins', async ({page, request, allowConsole}) => {
  const probe = await request.get(API + '/config/public', {headers: {Origin: OUTSIDER_URL.slice(0, -1)}});
  test.skip(probe.headers()['access-control-allow-origin'] !== undefined, 'API runs with CORS_ORIGINS=* (development)');
  allowConsole(/CORS policy|Failed to load resource/);
  await page.goto(OUTSIDER_URL);
  const outsider = await page.evaluate(async api => { try { await fetch(api + '/config/public'); return 'allowed'; } catch { return 'blocked'; } }, API);
  expect(outsider).toBe('blocked');
  await page.goto(portalUrl('student'));
  const portal = await page.evaluate(async api => (await fetch(api + '/config/public')).status, API);
  expect(portal).toBe(200);
});
