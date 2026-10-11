// The portal build script. Run: node --test frontend/tests/*.test.mjs
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, readdir, rm, writeFile, mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {pathToFileURL} from 'node:url';

import {APPS, FRONTEND, SHARED} from '../scripts/build-portal.mjs';

const SCRIPT = path.join(FRONTEND, 'scripts', 'build-portal.mjs');
const {PORTALS} = await import(pathToFileURL(path.join(SHARED, 'config/portals.js')).href);
const API = 'https://api.mirai.example.edu';
let tmp;

before(async () => { tmp = await mkdtemp(path.join(os.tmpdir(), 'mirai-build-')); });
after(async () => { await rm(tmp, {recursive: true, force: true}); });

// A clean environment: nothing from the developer's shell leaks into the build.
function build(args, {env = {}, cwd = FRONTEND} = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd, encoding: 'utf8', env: {PATH: process.env.PATH, ...env},
  });
  return {code: r.status, out: r.stdout + r.stderr};
}

async function filesUnder(dir) {
  const out = [];
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await filesUnder(full));
    else out.push(full);
  }
  return out;
}

const IMPORTS = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"\n]+)['"]|^[ \t]*import\s*['"]([^'"\n]+)['"]/gm;
const HTML_REFS = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

// Independent of the build script's own check: every reference must resolve inside out/.
async function assertSelfContained(out) {
  for (const file of await filesUnder(out)) {
    const text = await readFile(file, 'utf8');
    const refs = file.endsWith('.js') ? [...text.matchAll(IMPORTS)].map(m => m[1] ?? m[2])
      : file.endsWith('.html') ? [...text.matchAll(HTML_REFS)].map(m => m[1]) : [];
    for (const ref of refs) {
      assert.ok(ref.startsWith('./') || ref.startsWith('../'), `${file}: ${ref} is not relative`);
      const target = path.resolve(path.dirname(file), ref);
      assert.ok(target.startsWith(out + path.sep), `${path.relative(out, file)} reaches outside the build: ${ref}`);
      assert.ok(existsSync(target), `${path.relative(out, file)} refers to missing ${ref}`);
    }
  }
}

for (const portal of PORTALS) {
  test(`${portal.id}: builds on its own into a self-contained static site`, async () => {
    const out = path.join(tmp, portal.id);
    const r = build([portal.id, '--out', out], {env: {MIRAI_API_BASE_URL: API + '/'}});
    assert.equal(r.code, 0, r.out);
    for (const f of ['index.html', 'portal.js', 'portal-config.js', 'pages.js', '_headers', 'build-info.json',
      'shared/styles/app.css', 'shared/theme-init.js', 'shared/config/runtime-config.js', 'shared/app/portal-runtime.js'])
      assert.ok(existsSync(path.join(out, f)), `missing ${f}`);
    await assertSelfContained(out);

    const index = await readFile(path.join(out, 'index.html'), 'utf8');
    assert.match(index, /<script type="module" src="\.\/portal\.js">/);
    assert.match(index, /href="\.\/shared\/styles\/app\.css"/);
    assert.match(index, new RegExp(`<title>${portal.title}`));

    const runtime = await readFile(path.join(out, 'shared/config/runtime-config.js'), 'utf8');
    assert.match(runtime, /"apiBaseUrl": "https:\/\/api\.mirai\.example\.edu"/, 'trailing slash removed, API set');
    assert.match(runtime, /"environment": "production"/);
    assert.match(runtime, /"allowApiOverride": false/);
    assert.match(runtime, /"demoLogins": \[\]/);

    const config = await readFile(path.join(out, 'portal-config.js'), 'utf8');
    assert.match(config, new RegExp(`portalById\\('${portal.id}'\\)`));

    const headers = await readFile(path.join(out, '_headers'), 'utf8');
    assert.match(headers, /^\/\*$/m);
    assert.match(headers, /Content-Security-Policy: default-src 'self';.*connect-src 'self' https:\/\/api\.mirai\.example\.edu;/);
    assert.match(headers, /frame-ancestors 'none'/);
    assert.match(headers, portal.role === 'student' ? /camera=\(self\)/ : /camera=\(\)/);

    const info = JSON.parse(await readFile(path.join(out, 'build-info.json'), 'utf8'));
    assert.equal(info.portal, portal.id);
    assert.equal(info.role, portal.role);
    assert.equal(info.apiBaseUrl, API);

    for (const file of await filesUnder(out)) {
      const text = await readFile(file, 'utf8');
      assert.doesNotMatch(text, /password123|@demo\.edu/, `demo login details in ${path.relative(out, file)}`);
      assert.doesNotMatch(text, /localhost|127\.0\.0\.1/, `local address in ${path.relative(out, file)}`);
    }
    // No other portal's entry files, and nothing outside this portal's module graph.
    for (const other of PORTALS.filter(p => p !== portal)) assert.ok(!existsSync(path.join(out, other.id)));
  });
}

test('the student build publishes no staff or admin modules', async () => {
  const out = path.join(tmp, 'student-only');
  assert.equal(build(['student', '--out', out, '--api-base-url', API]).code, 0);
  const files = (await filesUnder(out)).map(f => path.relative(out, f));
  for (const forbidden of ['shared/features/admin', 'shared/features/dashboard', 'shared/features/duty-leave',
    'shared/features/submissions/grading.js', 'shared/features/checkin/staff-checkin.js', 'shared/features/events/staff-events.js',
    'shared/features/club-days/planner.js', 'shared/features/clubs/club-registry.js', 'shared/features/notifications/notification-log.js'])
    assert.ok(!files.some(f => f.startsWith(forbidden)), `student build contains ${forbidden}`);
});

test('the campus manager build has no campus creation or campus comparison', async () => {
  const out = path.join(tmp, 'campus-manager-only');
  assert.equal(build(['campus-manager', '--out', out, '--api-base-url', API]).code, 0);
  assert.ok(!existsSync(path.join(out, 'shared/features/admin/campus-create.js')));
  assert.ok(!existsSync(path.join(out, 'shared/features/dashboard/campus-comparison.js')));
  assert.ok(existsSync(path.join(out, 'shared/features/admin/administration.js')));
});

test('an unknown portal name fails with the list of portals', () => {
  const r = build(['teacher', '--api-base-url', API]);
  assert.equal(r.code, 2);
  assert.match(r.out, /Unknown portal "teacher"/);
  assert.match(r.out, /super-admin, campus-manager, advisor, coordinator, student/);
});

test('a missing portal name or an unknown option fails', () => {
  assert.equal(build(['--api-base-url', API]).code, 2);
  const r = build(['student', '--api', API]);
  assert.equal(r.code, 2);
  assert.match(r.out, /Unknown option --api/);
});

test('there is no API fallback: the build fails without MIRAI_API_BASE_URL', () => {
  const r = build(['student', '--out', path.join(tmp, 'no-api')]);
  assert.equal(r.code, 2);
  assert.match(r.out, /No API address/);
  assert.ok(!existsSync(path.join(tmp, 'no-api')), 'nothing is written when the build fails early');
});

for (const [bad, why] of [
  ['http://api.mirai.example.edu', /must use https/],
  ['javascript:alert(1)', /must use https/],
  ['ftp://api.mirai.example.edu', /must use https/],
  ['https://user:pw@api.mirai.example.edu', /credentials/],
  ['https://api.mirai.example.edu/?x=1', /query/],
  ['not a url', /not a valid URL/],
]) {
  test(`rejects the API address ${bad}`, () => {
    const r = build(['student', '--out', path.join(tmp, 'bad-api'), '--api-base-url', bad]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, why);
  });
}

test('accepts https with a path prefix, and http only for this computer', async () => {
  const out = path.join(tmp, 'prefix');
  assert.equal(build(['advisor', '--out', out, '--api-base-url', 'https://mirai.example.edu/api/']).code, 0);
  assert.match(await readFile(path.join(out, 'shared/config/runtime-config.js'), 'utf8'), /"apiBaseUrl": "https:\/\/mirai\.example\.edu\/api"/);
  assert.match(await readFile(path.join(out, '_headers'), 'utf8'), /connect-src 'self' https:\/\/mirai\.example\.edu;/);
  assert.equal(build(['advisor', '--out', out, '--api-base-url', 'http://127.0.0.1:8000']).code, 0);
  assert.equal(build(['advisor', '--out', out, '--api-base-url', 'http://localhost:8000']).code, 0);
});

test('demo logins appear only when asked for', async () => {
  const out = path.join(tmp, 'demo');
  assert.equal(build(['student', '--out', out, '--api-base-url', API, '--demo-accounts']).code, 0);
  const runtime = await readFile(path.join(out, 'shared/config/runtime-config.js'), 'utf8');
  assert.match(runtime, /"environment": "demo"/);
  assert.match(runtime, /s001@demo\.edu/);
  assert.equal(build(['student', '--out', out], {env: {MIRAI_API_BASE_URL: API, MIRAI_DEMO_ACCOUNTS: '1'}}).code, 0);
  assert.match(await readFile(path.join(out, 'shared/config/runtime-config.js'), 'utf8'), /"environment": "demo"/);
});

test('portal addresses for the wrong-portal screen come from MIRAI_PORTAL_URL_*', async () => {
  const out = path.join(tmp, 'links');
  const r = build(['super-admin', '--out', out], {env: {
    MIRAI_API_BASE_URL: API, MIRAI_PORTAL_URL_STUDENT: 'https://student.mirai.example.edu', MIRAI_PORTAL_URL_CAMPUS_MANAGER: 'https://campus.mirai.example.edu/',
  }});
  assert.equal(r.code, 0, r.out);
  const runtime = await readFile(path.join(out, 'shared/config/runtime-config.js'), 'utf8');
  assert.match(runtime, /"student": "https:\/\/student\.mirai\.example\.edu\/"/);
  assert.match(runtime, /"campus-manager": "https:\/\/campus\.mirai\.example\.edu\/"/);
  const bad = build(['super-admin', '--out', out], {env: {MIRAI_API_BASE_URL: API, MIRAI_PORTAL_URL_STUDENT: 'http://student.example.edu'}});
  assert.equal(bad.code, 2);
});

test('refuses to empty a folder it did not create, or the sources', async () => {
  const foreign = path.join(tmp, 'foreign');
  await mkdir(foreign, {recursive: true});
  await writeFile(path.join(foreign, 'keep.txt'), 'important');
  const r = build(['student', '--out', foreign, '--api-base-url', API]);
  assert.equal(r.code, 2);
  assert.match(r.out, /not created by this build script/);
  assert.equal(await readFile(path.join(foreign, 'keep.txt'), 'utf8'), 'important');
  for (const dir of [FRONTEND, path.join(APPS, 'student'), SHARED, path.join(SHARED, 'core'), path.resolve(FRONTEND, '..')])
    assert.equal(build(['student', '--out', dir, '--api-base-url', API]).code, 2, dir);
});

test('rebuilding into its own output replaces it cleanly', async () => {
  const out = path.join(tmp, 'rebuild');
  assert.equal(build(['coordinator', '--out', out, '--api-base-url', API]).code, 0);
  await writeFile(path.join(out, 'stale.js'), '// left over');
  assert.equal(build(['coordinator', '--out', out, '--api-base-url', API]).code, 0);
  assert.ok(!existsSync(path.join(out, 'stale.js')));
});

test('works as a Cloudflare Pages build command from the portal folder (root directory = frontend/apps/<portal>)', async () => {
  const appDir = path.join(APPS, 'student');
  const r = spawnSync(process.execPath, ['../../scripts/build-portal.mjs', 'student'], {
    cwd: appDir, encoding: 'utf8', env: {PATH: process.env.PATH, MIRAI_API_BASE_URL: API},
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /-> dist/);
  // The default output folder is <root directory>/dist, the "Build output directory" setting.
  const out = path.join(appDir, 'dist');
  assert.ok(existsSync(path.join(out, 'index.html')));
  await assertSelfContained(out);
});

test('works as a build command from the repository root', () => {
  const r = spawnSync(process.execPath, ['frontend/scripts/build-portal.mjs', 'student'], {
    cwd: path.resolve(FRONTEND, '..'), encoding: 'utf8', env: {PATH: process.env.PATH, MIRAI_API_BASE_URL: API},
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /-> frontend\/apps\/student\/dist/);
});
