// Builds the five portals for the API under test and serves each on its own origin.
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildPortal} from '../scripts/build-portal.mjs';
import {startServer} from '../scripts/serve.mjs';
import {API, DEV_URL, PORTAL_IDS, OFFLINE_URL, OUTSIDER_URL, portalUrl, portalPort, PORT_BASE} from './env.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILDS = path.join(FRONTEND, '.e2e-builds');

export default async function globalSetup() {
  let health;
  try { health = await (await fetch(API + '/health')).json(); } catch (e) {
    throw new Error(`The Mirai API is not reachable at ${API} (${e.message}). Start it first, e.g. ./scripts/run_local.sh --demo, or set MIRAI_E2E_API.`);
  }
  if (health.status !== 'ok') throw new Error(`The API at ${API} is not healthy: ${JSON.stringify(health)}`);

  await rm(BUILDS, {recursive: true, force: true});
  await mkdir(BUILDS, {recursive: true});
  const env = {...process.env, MIRAI_API_BASE_URL: API};
  for (const id of PORTAL_IDS) env[`MIRAI_PORTAL_URL_${id.toUpperCase().replaceAll('-', '_')}`] = portalUrl(id);

  const servers = [];
  for (const id of PORTAL_IDS) {
    const out = path.join(BUILDS, id);
    await buildPortal({portal: id, out}, env);
    servers.push(await startServer(out, {port: portalPort(id)}));
  }
  // A student portal whose API address points at a closed port: network failure handling.
  const offline = path.join(BUILDS, 'student-offline');
  await buildPortal({portal: 'student', out: offline, apiBaseUrl: 'http://127.0.0.1:9'}, {});
  servers.push(await startServer(offline, {port: Number(new URL(OFFLINE_URL).port)}));
  // A plain page on an origin the API does not list: the CORS allowlist check.
  const outsider = path.join(BUILDS, 'outsider');
  await mkdir(outsider, {recursive: true});
  await writeFile(path.join(outsider, 'index.html'), '<!doctype html><title>outsider</title>');
  servers.push(await startServer(outsider, {port: Number(new URL(OUTSIDER_URL).port)}));

  // The source tree itself (frontend/), as scripts/run_local.sh serves it.
  servers.push(await startServer(FRONTEND, {port: Number(new URL(DEV_URL).port)}));

  console.log(`E2E: API ${API}; portals on ports ${PORT_BASE + 1}-${PORT_BASE + PORTAL_IDS.length}`);
  return async () => { await Promise.all(servers.map(s => new Promise(r => s.close(r)))); };
}
