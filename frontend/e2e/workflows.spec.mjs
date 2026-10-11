// Cross-portal regression: the real workflows, each step done in the portal that owns it,
// against the real API. Creates its own campus data with a unique stamp, so it can run
// repeatedly on the same (development) database.
import {readFile} from 'node:fs/promises';

import {API, DEMO} from './env.mjs';
import {apiAs, apiToken, card, dialog, expect, expectToast, go, signedIn, test} from './fixtures.mjs';

test.describe.configure({mode: 'serial'});

const stamp = Date.now().toString(36);
const NEW = {
  name: `E2E Student ${stamp}`,
  email: `e2e-${stamp}@example.test`,
  code: `E2E-${stamp.toUpperCase()}`,
  password: `e2e-pass-${stamp}`,
  // Staff accounts of its own, so the seeded demo staff keep their original clubs.
  coordinator: {name: `E2E Coordinator ${stamp}`, email: `e2e-coord-${stamp}@example.test`, password: `e2e-coord-${stamp}`},
  advisor: {name: `E2E Advisor ${stamp}`, email: `e2e-adv-${stamp}@example.test`, password: `e2e-adv-${stamp}`},
  club: `E2E Club ${stamp}`,
  day: `E2E Day ${stamp}`,
  event: `E2E Event ${stamp}`,
  campus: `E2E Campus ${stamp}`,
  outerClub: `E2E Outer Club ${stamp}`,
  budget: `E2E budget ${stamp}`,
  link: `https://example.org/mirai-e2e/${stamp}`,
};
const today = new Date().toLocaleDateString('en-CA');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ctx = {};

// Form fields by their API field name (labels repeat words like "Club").
const field = (scope, name) => scope.locator(`[name="${name}"]`);
const dayRow = page => page.locator('tr', {hasText: NEW.day});
async function pickDay(page, select) {
  const value = await select.locator('option', {hasText: NEW.day}).first().getAttribute('value');
  await select.selectOption(value);
}
async function advance(page, label, status) {
  await dayRow(page).getByRole('button', {name: label}).click();
  if (label.startsWith('Close')) await dialog(page).getByRole('button', {name: 'Close & publish'}).click();
  await expectToast(page, `Club Day is now ${status}`);
}

async function createAccount(page, {name, email, password}, role, code) {
  const account = card(page, 'Create account');
  await field(account, 'name').fill(name);
  await field(account, 'email').fill(email);
  await field(account, 'password').fill(password);
  await field(account, 'role').selectOption(role);
  if (code) await field(account, 'student_code').fill(code);
  await account.getByRole('button', {name: 'Create account'}).click();
  await expectToast(page, 'Account created');
  await expect(card(page, 'Accounts').locator('tr', {hasText: email})).toContainText('Main Campus');
}

test('Campus Manager: provisions accounts, a club and its coordinator', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await expect(card(page, 'Participation by campus'), 'campus comparison is super admin only').toHaveCount(0);
  await go(page, 'Administration');
  await expect(card(page, 'Add campus'), 'campus creation is super admin only').toHaveCount(0);
  await expect(field(card(page, 'Create account'), 'role').locator('option'), 'campus managers create campus-level accounts only')
    .toHaveText(['Student', 'Club coordinator', 'Faculty advisor']);
  await createAccount(page, NEW, 'student', NEW.code);
  await createAccount(page, NEW.coordinator, 'coordinator');
  await createAccount(page, NEW.advisor, 'advisor');

  await go(page, 'Clubs');
  const create = card(page, 'Create club');
  await field(create, 'name').fill(NEW.club);
  await field(create, 'capacity').fill('10');
  await field(create, 'advisor_id').selectOption({label: NEW.advisor.name});
  await create.getByRole('button', {name: 'Create club'}).click();
  await expectToast(page, 'Club created');
  const staff = card(page, 'Add a coordinator');
  await field(staff, 'club_id').selectOption({label: NEW.club});
  await field(staff, 'user_id').selectOption({label: `${NEW.coordinator.name} · ${NEW.coordinator.email}`});
  await staff.getByRole('button', {name: 'Add coordinator'}).click();
  await expectToast(page, 'Coordinator added');
  await expect(card(page, 'All clubs').locator('tr', {hasText: NEW.club})).toContainText(NEW.coordinator.name);
});

test('Student: signs in with the new account and requests to join', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Clubs');
  await page.locator('tr', {hasText: NEW.club}).getByRole('button', {name: 'Join as primary'}).click();
  await expectToast(page, 'Request sent');
  await expect(card(page, 'My memberships').locator('tr', {hasText: NEW.club})).toContainText('Pending');
});

test('Coordinator: approves the membership request', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Members');
  await page.getByLabel('Club', {exact: true}).selectOption({label: NEW.club});
  await page.locator('tr', {hasText: NEW.name}).getByRole('button', {name: 'Approve'}).click();
  await expectToast(page, 'Approved');
  await expect(page.locator('tr', {hasText: NEW.name})).toContainText('Approved');
});

test('Coordinator: creates a Club Day and submits its plan', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Days');
  const form = card(page, 'New Club Day');
  await field(form, 'club_id').selectOption({label: NEW.club});
  await field(form, 'day_date').fill(today);
  await field(form, 'title').fill(NEW.day);
  await form.getByRole('button', {name: 'Create Club Day'}).click();
  await expectToast(page, 'Club Day created');
  await dayRow(page).getByRole('button', {name: 'Fill details'}).click();
  const plan = dialog(page);
  await field(plan, 'topic').fill('Robots that sort recycling');
  await field(plan, 'format').fill('Workshop');
  await field(plan, 'venue').fill('Lab 2');
  await field(plan, 'deliverable').fill('A photo of the working prototype');
  await plan.getByRole('button', {name: 'Submit for approval'}).click();
  await expectToast(page, 'Plan submitted for advisor approval');
  await expect(dayRow(page)).toContainText('Plan submitted');
});

test('Advisor: reviews and approves the plan, but cannot schedule Club Days', async ({page}) => {
  await signedIn(page, 'advisor', NEW.advisor.email, NEW.advisor.password);
  await expect(page.locator('.list-item', {hasText: `Review plan · ${NEW.day}`})).toBeVisible();
  await go(page, 'Days');
  await expect(card(page, 'New Club Day')).toHaveCount(0);
  await dayRow(page).getByRole('button', {name: 'Review plan'}).click();
  await dialog(page).getByRole('button', {name: 'Approve plan'}).click();
  await expectToast(page, 'Plan approved');
  await expect(dayRow(page)).toContainText('Plan approved');
  await expect(dayRow(page).getByRole('button', {name: 'Announce →'}), 'advisors do not run the lifecycle').toHaveCount(0);
});

test('Coordinator: announces, opens the day and starts a rotating-QR check-in', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Days');
  await advance(page, 'Announce →', 'announced');
  await advance(page, 'Open the day →', 'open');
  await go(page, 'Check-in');
  const open = card(page, 'Open a check-in window');
  await pickDay(page, field(open, 'club_day_id'));
  await open.getByRole('button', {name: 'Open window'}).click();
  await expectToast(page, 'Check-in window open');
  const live = page.locator('.live-box');
  // The QR library is fetched from cdnjs under the portal's CSP and its SRI hash.
  await expect(live.locator('.qr img, .qr canvas').first()).toBeAttached();
  await expect(live.locator('.big')).toHaveText(/^\S{4,}$/);
  ctx.sid = (await live.locator('.id-tag code').first().textContent()).replace('#', '');
  await expect(live.locator('tr', {hasText: NEW.name})).toContainText('Not yet checked in');
});

test('Student: checks in with the session code; a second scan is not duplicated', async ({page, request}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Check-in');
  const coordinator = apiAs(request, await apiToken(request, NEW.coordinator.email, NEW.coordinator.password));
  const qr = await (await coordinator.get(`/checkin/sessions/${ctx.sid}/qr`)).json();
  const form = card(page, 'Check in');
  await field(form, 'sid').fill(ctx.sid);
  await field(form, 'token').fill(qr.token);
  await form.getByRole('button', {name: 'Check in'}).click();
  await expect(page.locator('.checkin-result strong')).toHaveText('You are checked in');
  await field(form, 'token').fill(qr.token);
  await form.getByRole('button', {name: 'Check in'}).click();
  await expectToast(page, 'You are already checked in to this session');
  await expect(page.locator('.checkin-result strong')).toHaveText('Already checked in');
  await expect(card(page, 'My attendance').locator('tr', {hasText: NEW.club})).toHaveCount(1);
});

test('Coordinator: sees the check-in on the roster and opens submissions', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Check-in');
  await page.locator('tr', {hasText: `#${ctx.sid}`}).getByRole('button', {name: /Show live|Open/}).click();
  await expect(page.locator('.live-box tr', {hasText: NEW.name})).toContainText('Checked in');
  await go(page, 'Days');
  await advance(page, 'Open submissions →', 'submissions open');
});

test('Student: uploads a photo and submits a link', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Submit');
  await pickDay(page, page.getByLabel('Club Day', {exact: true}));
  const upload = card(page, 'Upload a file or photo');
  await field(upload, 'kind').selectOption('photo');
  await field(upload, 'file').setInputFiles({name: 'prototype.png', mimeType: 'image/png', buffer: PNG});
  await upload.getByRole('button', {name: 'Upload'}).click();
  await expectToast(page, 'Uploaded');
  const link = card(page, 'Submit a link');
  await field(link, 'url').fill(NEW.link);
  await link.getByRole('button', {name: 'Submit link'}).click();
  await expectToast(page, 'Submitted');
  const mine = card(page, 'My submissions');
  await expect(mine).toContainText(NEW.link);
  await expect(mine).toContainText('prototype.png');
  // The photo preview is fetched from the API with the student's token (blob: URL under the CSP).
  await mine.locator('tr', {hasText: 'prototype.png'}).getByRole('button', {name: 'Preview'}).click();
  await expect(dialog(page).locator('img.preview-img')).toBeVisible();
});

test('Coordinator: grades the submission, then closes and publishes the Club Day', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Grading');
  await pickDay(page, page.getByLabel('Club Day', {exact: true}));
  await page.locator('tr', {hasText: NEW.name}).getByRole('button', {name: 'Evaluate'}).click();
  const form = dialog(page);
  const scores = form.locator('input[type=number]');
  await expect(scores.first()).toBeFocused();  // the dialog focuses its first field just after opening
  for (const input of await scores.all()) {
    const max = await input.getAttribute('max');
    await input.fill(max);
    await expect(input).toHaveValue(max);
  }
  await field(form, 'comment').fill('Clear photo and a working link.');
  await form.getByRole('button', {name: 'Save evaluation'}).click();
  await expectToast(page, 'Evaluation saved');
  await expect(page.locator('tr', {hasText: NEW.name})).toContainText('Graded');
  await go(page, 'Days');
  await advance(page, 'Start evaluating →', 'evaluating');
  await advance(page, 'Close & publish →', 'closed');
});

test('Student: sees the published score, claims a certificate and downloads the PDF', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Submit');
  await pickDay(page, page.getByLabel('Club Day', {exact: true}));
  await expect(card(page, 'My submissions').locator('tr', {hasText: NEW.link})).toContainText(/\d+\/\d+/);
  await go(page, 'Certs');
  await pickDay(page, page.getByLabel('Club Day', {exact: true}));
  await page.getByRole('button', {name: 'Claim certificate'}).click();
  await expectToast(page, 'Requested');
  const mine = card(page, 'My certificates');
  // The PDF is rendered by a background worker; refresh until it is ready.
  await expect(async () => {
    await mine.getByRole('button', {name: 'Refresh'}).click();
    await expect(mine.getByRole('button', {name: 'PDF'})).toBeVisible({timeout: 2000});
  }).toPass({timeout: 60_000});
  await expect(mine.getByRole('link', {name: 'Verify'})).toHaveAttribute('href', new RegExp(`^${API.replace(/[.]/g, '\\.')}/verify/`));
  const [download] = await Promise.all([page.waitForEvent('download'), mine.getByRole('button', {name: 'PDF'}).click()]);
  expect((await readFile(await download.path())).subarray(0, 4).toString()).toBe('%PDF');
});

test('Student: the record includes the Club Day and exports as CSV', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Records');
  await expect(page.locator('.stat', {hasText: 'Club Days attended'})).toContainText('1');
  await expect(page.locator('tr', {hasText: NEW.day})).toContainText('Attended');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download CSV'}).click()]);
  expect(await readFile(await download.path(), 'utf8')).toContain(NEW.club);
});

test('Coordinator: requests a budget it cannot approve itself', async ({page}) => {
  await signedIn(page, 'coordinator', NEW.coordinator.email, NEW.coordinator.password);
  await go(page, 'Budgets');
  const form = card(page, 'New funding request');
  await field(form, 'club_id').selectOption({label: NEW.club});
  await field(form, 'title').fill(NEW.budget);
  await field(form, 'description').fill('Motors and sensors for the prototype');
  await field(form, 'amount').fill('1250.50');
  await form.getByRole('button', {name: 'Send for approval'}).click();
  await expectToast(page, 'Budget request submitted');
  const row = page.locator('tr', {hasText: NEW.budget});
  await expect(row).toContainText('Pending');
  await expect(row.getByRole('button', {name: 'Approve'})).toHaveCount(0);
});

test('Campus Manager: approves the budget', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await go(page, 'Budgets');
  await page.locator('tr', {hasText: NEW.budget}).getByRole('button', {name: 'Approve'}).click();
  await dialog(page).getByRole('button', {name: 'Approve'}).click();
  await expectToast(page, 'Request approved');
  await expect(page.locator('tr', {hasText: NEW.budget})).toContainText('Approved by Main Campus Admin');
});

test('Campus Manager: creates an event', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await go(page, 'Events');
  const form = card(page, 'Create event');
  await field(form, 'name').fill(NEW.event);
  await field(form, 'type').selectOption('hackathon');
  await field(form, 'capacity').fill('20');
  await field(form, 'team_size').fill('3');
  await form.getByRole('button', {name: 'Create event'}).click();
  await expectToast(page, 'Event created');
  await expect(page.locator('tr', {hasText: NEW.event})).toContainText('0/20');
});

test('Student: registers for the event and creates a team', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await go(page, 'Events');
  await expect(card(page, 'Create event')).toHaveCount(0);
  await page.locator('tr', {hasText: NEW.event}).getByRole('button', {name: 'Explore'}).click();
  await page.getByRole('button', {name: 'Register', exact: true}).click();
  await expectToast(page, 'Registered');
  await field(page.locator('form', {has: page.getByRole('button', {name: 'Create team'})}), 'name').fill(`Team ${stamp}`);
  await page.getByRole('button', {name: 'Create team'}).click();
  await expectToast(page, 'Team created');
  await expect(page.locator('tr', {hasText: `Team ${stamp}`})).toContainText(NEW.name);
  await expect(page.getByRole('button', {name: 'Unregister'})).toBeVisible();
});

test('Campus Manager: checks the student in at the event', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await go(page, 'Events');
  await page.locator('tr', {hasText: NEW.event}).getByRole('button', {name: 'Explore'}).click();
  const row = page.locator('tr', {hasText: NEW.code});
  await row.getByRole('button', {name: 'Check in'}).click();
  await expect(page.locator('tr', {hasText: NEW.code}).getByRole('button', {name: 'Check in'})).toHaveCount(0);
});

test('Campus Manager: reschedules the event and registered students are notified', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await go(page, 'Events');
  await page.locator('tr', {hasText: NEW.event}).getByRole('button', {name: 'Explore'}).click();
  await page.getByRole('button', {name: 'Reschedule'}).click();
  const when = new Date(Date.now() + 3 * 864e5);
  when.setHours(10, 0, 0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  await field(dialog(page), 'starts_at').fill(local);
  await field(dialog(page), 'reason').fill('Lab booking moved');
  await dialog(page).getByRole('button', {name: 'Reschedule event'}).click();
  await expectToast(page, '1 notified');
});

test('Student: the notice arrives in the inbox and can be marked read', async ({page}) => {
  await signedIn(page, 'student', NEW.email, NEW.password);
  await expect(page.locator('#unreadBadge')).toHaveText('1');
  await go(page, 'Notifications');
  const inbox = card(page, 'Notifications');
  await expect(inbox.locator('tr', {hasText: 'Event rescheduled'})).toContainText('Lab booking moved');
  await expect(inbox).toContainText('1 unread');
  await inbox.getByRole('button', {name: 'Mark all read'}).click();
  await expect(inbox).toContainText('0 unread');
  await expect(page.locator('#unreadBadge')).toBeHidden();
});

test('Campus Manager: dashboard export, notification history, Duty Leave and transcript lookup', async ({page}) => {
  await signedIn(page, 'campus-manager');
  await expect(card(page, 'Summary')).toContainText('Clubs');
  const clubs = card(page, 'Clubs').filter({hasText: 'Every figure is counted'});
  await expect(clubs.locator('tr', {hasText: NEW.club})).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), clubs.getByRole('button', {name: 'Download CSV'}).click()]);
  expect(await readFile(await csv.path(), 'utf8')).toContain(NEW.club);
  await go(page, 'Notification log');
  await expect(page.locator('.stat', {hasText: 'Matching notifications'})).toBeVisible();
  await expect(page.locator('tr', {hasText: NEW.name}).first()).toBeVisible();
  await go(page, 'Duty Leave');
  await expect(card(page, 'Duty Leave queue')).toBeVisible();
  await go(page, 'Records');
  await field(page, 'ref').fill(NEW.code);
  await page.getByRole('button', {name: 'Load transcript'}).click();
  await expect(page.getByRole('heading', {name: NEW.name})).toBeVisible();
  await expect(page.locator('tr', {hasText: NEW.day})).toContainText('Attended');
});

test('Super Admin: creates a campus and a club there, and compares campuses', async ({page}) => {
  await signedIn(page, 'super-admin');
  await expect(card(page, 'Participation by campus')).toBeVisible();
  await go(page, 'Administration');
  const add = card(page, 'Add campus');
  await field(add, 'name').fill(NEW.campus);
  await add.getByRole('button', {name: 'Create campus'}).click();
  await expectToast(page, 'Campus created');
  await expect(card(page, 'Campuses')).toContainText(NEW.campus);
  await go(page, 'Clubs');
  const create = card(page, 'Create club');
  await field(create, 'name').fill(NEW.outerClub);
  await field(create, 'capacity').fill('5');
  await field(create, 'campus_id').selectOption({label: NEW.campus});
  await create.getByRole('button', {name: 'Create club'}).click();
  await expectToast(page, 'Club proposed');
  await expect(page.locator('tr', {hasText: NEW.outerClub})).toContainText(NEW.campus);
});

test('Campus scoping: other campuses stay invisible in the portals and the API', async ({page, request}) => {
  await signedIn(page, 'campus-manager');
  await go(page, 'Clubs');
  await expect(page.locator('tr', {hasText: NEW.club})).toBeVisible();
  await expect(page.locator('tr', {hasText: NEW.outerClub})).toHaveCount(0);

  const superAdmin = apiAs(request, await apiToken(request, DEMO['super-admin']));
  const outer = (await (await superAdmin.get('/clubs')).json()).find(c => c.name === NEW.outerClub);
  expect(outer).toBeTruthy();
  const manager = apiAs(request, await apiToken(request, DEMO['campus-manager']));
  expect([403, 404]).toContain((await manager.get(`/clubs/${outer.id}`)).status());
  expect([403, 404]).toContain((await manager.post(`/clubs/${outer.id}/decision`, {decision: 'approve'})).status());

  const north = apiAs(request, await apiToken(request, 'n001@demo.edu'));
  const northClubs = (await (await north.get('/clubs')).json()).map(c => c.name);
  expect(northClubs).not.toContain(NEW.club);
});
