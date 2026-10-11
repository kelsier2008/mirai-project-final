#!/usr/bin/env node
// Builds one Mirai role portal into a static folder that Cloudflare Pages (or any static
// host) can publish on its own.
//
//   node frontend/scripts/build-portal.mjs <portal> [--api-base-url URL] [--out DIR] [--demo-accounts]
//
//   <portal>          super-admin | campus-manager | advisor | coordinator | student
//   --api-base-url    the shared Mirai API, e.g. https://api.example.edu
//                     (default: $MIRAI_API_BASE_URL; required, there is no fallback)
//   --out             output folder (default: frontend/apps/<portal>/dist)
//   --demo-accounts   show the seeded demo logins on the sign-in screen
//                     (default: $MIRAI_DEMO_ACCOUNTS=1). Never for real deployments.
//
// Optional: MIRAI_PORTAL_URL_<PORTAL> (for example MIRAI_PORTAL_URL_STUDENT) gives the
// address of each portal so a user who signs in to the wrong one is pointed to theirs.
//
// What it does: starts at the portal's index.html, follows every local <script>, <link>,
// CSS url() and ES module import, and copies exactly those files. The portal's own files
// go to the output root and shared modules to shared/, with relative imports rewritten,
// so the output never reaches outside its own folder. Modules no page of this portal
// imports (for example staff pages in the student build) are not published. It then
// writes the deployment config (runtime-config.js), Cloudflare Pages _headers and
// build-info.json, and checks that every reference in the output resolves inside it.
//
// Node 18 or newer; no npm packages. Exits non-zero on any problem.
import {existsSync} from 'node:fs';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = path.join(FRONTEND, 'apps');
const SHARED = path.join(FRONTEND, 'shared');
const RUNTIME_CONFIG = path.join(SHARED, 'config', 'runtime-config.js');
const MARKER = 'build-info.json';
const GENERATOR = 'mirai frontend/scripts/build-portal.mjs';
const QR_LIBRARY_ORIGIN = 'https://cdnjs.cloudflare.com';

export class BuildError extends Error {}
export {FRONTEND, APPS, SHARED};

const {PORTALS} = await import(pathToFileURL(path.join(SHARED, 'config', 'portals.js')).href);

function usage() {
  return `Usage: node frontend/scripts/build-portal.mjs <portal> [--api-base-url URL] [--out DIR] [--demo-accounts]
Portals: ${PORTALS.map(p => p.id).join(', ')}
The API address can also come from MIRAI_API_BASE_URL.`;
}

function parseArgs(argv) {
  const opts = {portal: null, out: null, apiBaseUrl: null, demo: null, help: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (v === undefined || v === '') throw new BuildError(`${arg.split('=')[0]} needs a value`);
      return v;
    };
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--out' || arg.startsWith('--out=')) opts.out = value();
    else if (arg === '--api-base-url' || arg.startsWith('--api-base-url=')) opts.apiBaseUrl = value();
    else if (arg === '--demo-accounts') opts.demo = true;
    else if (arg.startsWith('-')) throw new BuildError(`Unknown option ${arg}\n${usage()}`);
    else if (opts.portal) throw new BuildError(`Only one portal per build (got ${opts.portal} and ${arg})`);
    else opts.portal = arg;
  }
  return opts;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLoopback = host => LOOPBACK.has(host) || host.endsWith('.localhost');

// An http(s) address with no credentials, query or fragment. Plain http is accepted only
// for this computer, so a production build cannot send passwords unencrypted.
function checkHttpUrl(raw, what) {
  let url;
  try { url = new URL(raw); } catch { throw new BuildError(`${what} is not a valid URL: ${raw}`); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname)))
    throw new BuildError(`${what} must use https:// (http:// is allowed only for localhost): ${raw}`);
  if (url.username || url.password || url.search || url.hash)
    throw new BuildError(`${what} must not contain credentials, a query or a fragment: ${raw}`);
  return url;
}

export function normaliseApiBaseUrl(raw) {
  if (!raw || !raw.trim())
    throw new BuildError('No API address. Set MIRAI_API_BASE_URL (for example https://api.example.edu) or pass --api-base-url.');
  const url = checkHttpUrl(raw.trim(), 'The API address');
  const pathname = url.pathname.replace(/\/+$/, '');
  return {url: url.origin + pathname, origin: url.origin};
}

function portalUrlsFromEnv(env) {
  const urls = {};
  for (const p of PORTALS) {
    const raw = env[`MIRAI_PORTAL_URL_${p.id.toUpperCase().replaceAll('-', '_')}`];
    if (raw && raw.trim()) {
      const url = checkHttpUrl(raw.trim(), `MIRAI_PORTAL_URL_${p.id.toUpperCase().replaceAll('-', '_')}`);
      urls[p.id] = url.href.endsWith('/') ? url.href : url.href + '/';
    }
  }
  return urls;
}

const within = (dir, file) => {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// Never empty a folder this script did not create, or one that holds the sources.
async function prepareOutDir(out, appDir) {
  for (const protectedDir of [FRONTEND, APPS, SHARED, appDir])
    if (within(out, protectedDir)) throw new BuildError(`Refusing to use ${out} as the output folder: it contains the frontend sources`);
  if (within(SHARED, out)) throw new BuildError(`Refusing to write the build inside ${SHARED}`);
  if (existsSync(out)) {
    const entries = await readdir(out);
    if (entries.length) {
      let ours = false;
      try { ours = JSON.parse(await readFile(path.join(out, MARKER), 'utf8')).generator === GENERATOR; } catch { ours = false; }
      if (!ours) throw new BuildError(`Refusing to empty ${out}: it is not empty and was not created by this build script`);
    }
    await rm(out, {recursive: true, force: true});
  }
  await mkdir(out, {recursive: true});
}

// ---- reference discovery -------------------------------------------------------------
// The frontend keeps every import on its own line(s) at the top of a module, so these
// patterns only look at statements that start a line.
const JS_IMPORT = /^([ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*)(['"])([^'"\n]+)\2|^([ \t]*import\s*)(['"])([^'"\n]+)\5/gm;
const HTML_REF = /(<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi;
const CSS_URL = /(url\(\s*)(["']?)([^"')]+)\2(\s*\))/gi;

function refPattern(file) {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return JS_IMPORT;
  if (file.endsWith('.html')) return HTML_REF;
  if (file.endsWith('.css')) return CSS_URL;
  return null;
}

function specifiersIn(file, text) {
  const re = refPattern(file);
  if (!re) return [];
  return [...text.matchAll(re)].map(m => (re === JS_IMPORT ? (m[3] ?? m[6]) : m[3]));
}

const isExternal = spec => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(spec);

function resolveLocal(fromFile, spec) {
  if (spec.startsWith('data:')) return null;
  if (isExternal(spec)) throw new BuildError(`${path.relative(FRONTEND, fromFile)} loads ${spec} from another site. Keep portal code and assets local.`);
  if (spec.startsWith('/')) throw new BuildError(`${path.relative(FRONTEND, fromFile)} uses the absolute path ${spec}; use a relative path so the portal works from its own folder.`);
  if (!spec.startsWith('.')) throw new BuildError(`${path.relative(FRONTEND, fromFile)} imports the bare module "${spec}"; this build has no bundler, so use a relative path.`);
  return path.resolve(path.dirname(fromFile), spec.split(/[?#]/)[0]);
}

// The local files one source file loads (absolute paths).
export async function localRefs(file) {
  if (!refPattern(file)) return [];
  const text = await readFile(file, 'utf8');
  return specifiersIn(file, text).map(spec => resolveLocal(file, spec)).filter(Boolean);
}

// Every file a page needs, starting from its index.html.
export async function collectFiles(entry) {
  const seen = new Set(), order = [], queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) throw new BuildError(`Missing file: ${path.relative(FRONTEND, file)}`);
    order.push(file);
    queue.push(...await localRefs(file));
  }
  return order;
}

function outputPathFor(file, appDir, out) {
  if (within(appDir, file)) return path.join(out, path.relative(appDir, file));
  if (within(SHARED, file)) return path.join(out, 'shared', path.relative(SHARED, file));
  throw new BuildError(`${path.relative(FRONTEND, file)} is outside the portal and frontend/shared; a portal may only use its own files and shared modules`);
}

function rewriteRefs(file, text, outFile, appDir, out) {
  const re = refPattern(file);
  if (!re) return text;
  const fix = spec => {
    const target = resolveLocal(file, spec);
    if (!target) return spec;
    const suffix = spec.slice(spec.split(/[?#]/)[0].length);
    let rel = path.relative(path.dirname(outFile), outputPathFor(target, appDir, out)).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel + suffix;
  };
  if (re === JS_IMPORT)
    return text.replace(re, (m, a, q, s, b, q2, s2) => (s !== undefined ? `${a}${q}${fix(s)}${q}` : `${b}${q2}${fix(s2)}${q2}`));
  if (re === HTML_REF) return text.replace(re, (m, a, q, s) => `${a}${q}${fix(s)}${q}`);
  return text.replace(re, (m, a, q, s, z) => `${a}${q}${fix(s)}${q}${z}`);
}

// ---- generated files -----------------------------------------------------------------
async function runtimeConfigSource({api, demo, portalUrls}) {
  const dev = (await import(pathToFileURL(RUNTIME_CONFIG).href)).runtimeConfig;
  const config = {
    environment: demo ? 'demo' : 'production',
    apiBaseUrl: api.url,
    allowApiOverride: false,
    demoPassword: demo ? dev.demoPassword : '',
    demoLogins: demo ? dev.demoLogins : [],
    portalUrls,
  };
  return `// Generated by frontend/scripts/build-portal.mjs. Do not edit; rebuild instead.
// Public deployment settings for this portal: never put a secret here.
export const runtimeConfig = Object.freeze(${JSON.stringify(config, null, 2)});
`;
}

function headersFile(portal, api) {
  const student = portal.role === 'student';
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${QR_LIBRARY_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${api.origin}`,
    'frame-src blob:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return `# Generated by frontend/scripts/build-portal.mjs for the ${portal.title}.
# Cloudflare Pages applies these headers to every response.
/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(${student ? 'self' : ''}), geolocation=(${student ? 'self' : ''}), microphone=(), payment=(), usb=()
`;
}

// ---- verification --------------------------------------------------------------------
async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

async function verifyOutput(out, demo) {
  if (!existsSync(path.join(out, 'index.html'))) throw new BuildError('The build has no index.html');
  for (const file of await listFiles(out)) {
    if (!refPattern(file)) continue;
    const text = await readFile(file, 'utf8');
    for (const spec of specifiersIn(file, text)) {
      if (spec.startsWith('data:')) continue;
      const target = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
      if (!within(out, target)) throw new BuildError(`${path.relative(out, file)} refers to ${spec}, outside the build folder`);
      if (!existsSync(target)) throw new BuildError(`${path.relative(out, file)} refers to ${spec}, which is not in the build`);
    }
    if (!demo && /password123|@demo\.edu/.test(text)) throw new BuildError(`${path.relative(out, file)} contains demo login details in a production build`);
  }
}

// ---- main ----------------------------------------------------------------------------
export async function buildPortal({portal: portalId, out, apiBaseUrl, demo}, env = process.env) {
  const portal = PORTALS.find(p => p.id === portalId);
  if (!portal) throw new BuildError(`Unknown portal "${portalId ?? ''}". Choose one of: ${PORTALS.map(p => p.id).join(', ')}`);
  const appDir = path.join(APPS, portal.id);
  const entry = path.join(appDir, 'index.html');
  if (!existsSync(entry)) throw new BuildError(`frontend/apps/${portal.id}/index.html is missing`);
  const api = normaliseApiBaseUrl(apiBaseUrl ?? env.MIRAI_API_BASE_URL);
  const demoLogins = demo ?? env.MIRAI_DEMO_ACCOUNTS === '1';
  const portalUrls = portalUrlsFromEnv(env);
  const outDir = path.resolve(out ?? path.join(appDir, 'dist'));

  const files = await collectFiles(entry);
  if (!files.includes(RUNTIME_CONFIG)) throw new BuildError('The portal does not load shared/config/runtime-config.js');
  await prepareOutDir(outDir, appDir);
  for (const file of files) {
    const target = outputPathFor(file, appDir, outDir);
    await mkdir(path.dirname(target), {recursive: true});
    if (file === RUNTIME_CONFIG) await writeFile(target, await runtimeConfigSource({api, demo: demoLogins, portalUrls}));
    else if (refPattern(file)) await writeFile(target, rewriteRefs(file, await readFile(file, 'utf8'), target, appDir, outDir));
    else await cp(file, target);
  }
  await writeFile(path.join(outDir, '_headers'), headersFile(portal, api));
  await writeFile(path.join(outDir, MARKER), JSON.stringify({
    generator: GENERATOR,
    portal: portal.id,
    role: portal.role,
    apiBaseUrl: api.url,
    demoAccounts: demoLogins,
    commit: env.CF_PAGES_COMMIT_SHA || null,
    branch: env.CF_PAGES_BRANCH || null,
    files: files.length,
  }, null, 2) + '\n');
  await verifyOutput(outDir, demoLogins);
  return {portal, outDir, api, files: files.length, demoLogins};
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(usage()); process.exit(0); }
    if (!opts.portal) throw new BuildError(`Name the portal to build.\n${usage()}`);
    const r = await buildPortal(opts);
    console.log(`Built the ${r.portal.title} (${r.portal.role}): ${r.files} source files -> ${path.relative(process.cwd(), r.outDir) || '.'}`);
    console.log(`API: ${r.api.url}${r.demoLogins ? '   (demo accounts shown on the sign-in screen)' : ''}`);
  } catch (e) {
    console.error(`build-portal: ${e instanceof BuildError ? e.message : e.stack || e}`);
    process.exit(e instanceof BuildError ? 2 : 1);
  }
}
