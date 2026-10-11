// The unbuilt source as scripts/run_local.sh serves it: development config, demo logins,
// the API override and relative links between portals.
import {API, DEV_URL} from './env.mjs';
import {expect, test} from './fixtures.mjs';

test.beforeEach(async ({page}) => {
  // The development config expects the API on port 8000; point it at the API under test
  // the way a developer would, with Connection settings.
  await page.addInitScript(api => localStorage.setItem('api', api), API);
});

test('the launcher links all five portals', async ({page}) => {
  await page.goto(DEV_URL);
  await expect(page.locator('.portal-index a')).toHaveText(['Super Admin Portal', 'Campus Manager Portal', 'Advisor Portal', 'Coordinator Portal', 'Student Portal']);
});

test('a portal runs from source with its own demo login and connection settings', async ({page}) => {
  await page.goto(DEV_URL + 'apps/coordinator/');
  await expect(page.locator('.api-setting')).toBeVisible();
  await expect(page.locator('.demo-area button')).toHaveText(['Coordinator']);
  await page.locator('.demo-area button').click();
  await page.getByRole('button', {name: 'Continue to workspace'}).click();
  await expect(page.locator('#nav button[data-page="Members"]')).toBeVisible();
  await expect(page.locator('#view .skeleton-card')).toHaveCount(0);
});

test('the wrong-portal screen links to the right portal next door', async ({page}) => {
  await page.goto(DEV_URL + 'apps/student/');
  await page.locator('input[name=identifier]').fill('advisor@demo.edu');
  await page.locator('input[name=password]').fill('password123');
  await page.getByRole('button', {name: 'Continue to workspace'}).click();
  await page.getByRole('link', {name: 'Open the Advisor Portal'}).click();
  await expect(page).toHaveURL(DEV_URL + 'apps/advisor/');
  await expect(page.getByRole('heading', {name: 'Sign in to the Advisor Portal'})).toBeVisible();
});
