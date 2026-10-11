// Portal configuration and module boundaries. Run: node --test frontend/tests/*.test.mjs
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';

import {APPS, FRONTEND, SHARED, collectFiles, localRefs} from '../scripts/build-portal.mjs';

const REPO = path.resolve(FRONTEND, '..');
const {PORTALS} = await import(pathToFileURL(path.join(SHARED, 'config/portals.js')).href);
const {pageCopy, navGlyph} = await import(pathToFileURL(path.join(SHARED, 'navigation/page-meta.js')).href);
const load = async (portal, file) => import(pathToFileURL(path.join(APPS, portal.id, file)).href);

// Navigation per role in the single-file frontend before the split (TABS in the old
// frontend/index.html). Each portal must keep exactly these pages, in this order.
const ORIGINAL_TABS = {
  student: ['Home', 'Clubs', 'Days', 'Check-in', 'Submit', 'Certs', 'Events', 'Records', 'Notifications'],
  coordinator: ['Home', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications'],
  advisor: ['Home', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications'],
  campus_admin: ['Dashboard', 'Administration', 'Clubs', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Duty Leave', 'Records', 'Notification log', 'Notifications'],
};
ORIGINAL_TABS.super_admin = ORIGINAL_TABS.campus_admin;

async function backendRoles() {
  const src = await readFile(path.join(REPO, 'backend/app/core/permissions.py'), 'utf8');
  const m = src.match(/^ROLES = \(([^)]*)\)/m);
  assert.ok(m, 'ROLES tuple not found in permissions.py');
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map(x => x[1]);
}

const moduleSet = async portal =>
  new Set((await collectFiles(path.join(APPS, portal.id, 'index.html'))).map(f => path.relative(SHARED, f).split(path.sep).join('/')));

test('there are exactly five portals, one per canonical backend role', async () => {
  const roles = await backendRoles();
  assert.deepEqual(PORTALS.map(p => p.id), ['super-admin', 'campus-manager', 'advisor', 'coordinator', 'student']);
  assert.deepEqual([...PORTALS.map(p => p.role)].sort(), [...roles].sort());
  const dirs = (await readdir(APPS, {withFileTypes: true})).filter(d => d.isDirectory()).map(d => d.name).sort();
  assert.deepEqual(dirs, PORTALS.map(p => p.id).sort());
});

for (const portal of PORTALS) {
  test(`${portal.id}: config names its canonical role and keeps the original navigation`, async () => {
    const {portalConfig} = await load(portal, 'portal-config.js');
    assert.equal(portalConfig.portalId, portal.id);
    assert.equal(portalConfig.expectedRole, portal.role);
    assert.equal(portalConfig.title, portal.title);
    assert.deepEqual([...portalConfig.pages], ORIGINAL_TABS[portal.role]);
    assert.ok(Object.isFrozen(portalConfig));
    for (const field of ['spaceLabel', 'identifierLabel', 'loginIntro']) assert.ok(portalConfig[field], field);
    for (const t of portalConfig.pages) {
      assert.ok(pageCopy[t], `page-meta has no title for ${t}`);
      assert.ok(navGlyph[t], `page-meta has no icon for ${t}`);
    }
  });

  test(`${portal.id}: every page in the navigation has a renderer, and nothing else`, async () => {
    const [{portalConfig}, {pages}] = await Promise.all([load(portal, 'portal-config.js'), load(portal, 'pages.js')]);
    assert.deepEqual(Object.keys(pages), [...portalConfig.pages]);
    for (const [t, render] of Object.entries(pages)) assert.equal(typeof render, 'function', t);
  });

  test(`${portal.id}: reads the API address from the shared deployment config`, async () => {
    const [{portalConfig}, {runtimeConfig}] = await Promise.all([
      load(portal, 'portal-config.js'),
      import(pathToFileURL(path.join(SHARED, 'config/runtime-config.js')).href),
    ]);
    assert.equal(portalConfig.apiBaseUrl, runtimeConfig.apiBaseUrl);
    const api = await readFile(path.join(SHARED, 'core/api.js'), 'utf8');
    assert.match(api, /runtimeConfig\.apiBaseUrl/);
    assert.equal(runtimeConfig.environment, 'development', 'the committed runtime-config.js must stay the development default');
  });
}

// Which shared modules each portal is allowed to load. Staff pages never reach the
// student build, admin pages never reach advisors or coordinators, and campus creation
// and the campus comparison stay in the super admin portal.
const STUDENT_ONLY = ['home/student-home.js', 'clubs/student-clubs.js', 'club-days/student-days.js', 'checkin/student-checkin.js',
  'submissions/student-submit.js', 'certificates/student-certificates.js', 'events/student-events.js', 'records/student-records.js'];
const STAFF_ONLY = ['club-days/planner.js', 'club-days/day-workflow.js', 'club-days/calendar-import.js', 'checkin/staff-checkin.js',
  'checkin/qrcode.js', 'submissions/grading.js', 'certificates/staff-certificates.js', 'events/staff-events.js',
  'budgets/budgets.js', 'dashboard/dashboard.js'];
const ADMIN_ONLY = ['admin/administration.js', 'clubs/club-registry.js', 'duty-leave/duty-leave.js',
  'notifications/notification-log.js', 'records/transcript-lookup.js'];
const SUPER_ONLY = ['admin/campus-create.js', 'dashboard/campus-comparison.js'];
const f = list => list.map(x => 'features/' + x);
const EXPECT = {
  student: {has: f(STUDENT_ONLY), lacks: f([...STAFF_ONLY, ...ADMIN_ONLY, ...SUPER_ONLY, 'home/staff-home.js', 'clubs/membership-requests.js'])},
  coordinator: {has: f([...STAFF_ONLY, 'home/staff-home.js', 'clubs/membership-requests.js']), lacks: f([...STUDENT_ONLY, ...ADMIN_ONLY, ...SUPER_ONLY])},
  advisor: {has: f([...STAFF_ONLY, 'home/staff-home.js']), lacks: f([...STUDENT_ONLY, ...ADMIN_ONLY, ...SUPER_ONLY, 'clubs/membership-requests.js'])},
  campus_admin: {has: f([...STAFF_ONLY, ...ADMIN_ONLY, 'clubs/membership-requests.js']), lacks: f([...STUDENT_ONLY, ...SUPER_ONLY, 'home/staff-home.js'])},
  super_admin: {has: f([...STAFF_ONLY, ...ADMIN_ONLY, ...SUPER_ONLY, 'clubs/membership-requests.js']), lacks: f([...STUDENT_ONLY, 'home/staff-home.js'])},
};

for (const portal of PORTALS) {
  test(`${portal.id}: loads only the feature modules for its role`, async () => {
    const mods = await moduleSet(portal);
    for (const m of EXPECT[portal.role].has) assert.ok(mods.has(m), `${portal.id} should load ${m}`);
    for (const m of EXPECT[portal.role].lacks) assert.ok(!mods.has(m), `${portal.id} must not load ${m}`);
    for (const m of ['config/runtime-config.js', 'auth/session.js', 'auth/role-mismatch-view.js', 'core/api.js', 'styles/app.css'])
      assert.ok(mods.has(m), `${portal.id} should load ${m}`);
  });
}

async function allSharedFiles(dir = SHARED) {
  const out = [];
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await allSharedFiles(full));
    else out.push(full);
  }
  return out;
}

test('every shared module is used by at least one portal', async () => {
  const used = new Set();
  for (const portal of PORTALS) for (const m of await moduleSet(portal)) used.add(m);
  const unused = (await allSharedFiles()).map(x => path.relative(SHARED, x).split(path.sep).join('/')).filter(x => !used.has(x));
  assert.deepEqual(unused, []);
});

test('shared modules have no import cycles', async () => {
  const files = (await allSharedFiles()).filter(x => x.endsWith('.js'));
  const edges = new Map();
  for (const file of files) edges.set(file, await localRefs(file));
  const state = new Map();
  const visit = (file, trail) => {
    if (state.get(file) === 'done') return;
    if (state.get(file) === 'active') assert.fail('import cycle: ' + [...trail, file].map(x => path.relative(SHARED, x)).join(' -> '));
    state.set(file, 'active');
    for (const next of edges.get(file) || []) visit(next, [...trail, file]);
    state.set(file, 'done');
  };
  for (const file of files) visit(file, []);
});

test('the frontend source never hardcodes a production API host or stores secrets', async () => {
  for (const file of await allSharedFiles()) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /onrender\.com|pages\.dev|JWT_SECRET|CERT_SECRET|DATABASE_URL/, path.relative(FRONTEND, file));
  }
});

test('the sign-in flow checks the role before it shows a portal', async () => {
  const session = await readFile(path.join(SHARED, 'auth/session.js'), 'utf8');
  const runtime = await readFile(path.join(SHARED, 'app/portal-runtime.js'), 'utf8');
  // signIn stores the token only after the role matches.
  assert.match(session, /if\(!roleMatches\(portal,r\.user\)\)return\{ok:false,user:r\.user\};\s*storeToken/);
  // A restored session is checked against /auth/me before the shell is shown.
  assert.match(runtime, /if\(!roleMatches\(portal,user\)\)\{clearSession\(portal\);return roleMismatchView/);
});
