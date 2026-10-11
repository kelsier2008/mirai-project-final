import {test as base, expect} from '@playwright/test';

import {API, DEMO, DEMO_PASSWORD, PORT_BASE, portalUrl} from './env.mjs';

const apiOrigin = new URL(API).origin;
const LOCAL_TEST_ORIGIN = /^http:\/\/127\.0\.0\.1:(\d+)$/;

// Every test fails on an uncaught page error, a console error (including Content
// Security Policy violations) or a request to anywhere other than the test portals, the
// API and the pinned QR library on cdnjs. Chrome logs failed HTTP responses as console
// errors too; tests that cause one on purpose call `allowConsole(/pattern/)`.
export const test = base.extend({
  allowed: async ({}, use) => { await use([/Failed to load resource: the server responded with a status of (401|403|404|409|422)/]); },
  allowConsole: async ({allowed}, use) => { await use(re => allowed.push(re)); },
  page: async ({page, allowed}, use) => {
    const problems = [];
    page.on('pageerror', e => problems.push(`page error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    page.on('request', r => {
      const url = new URL(r.url());
      if (['data:', 'blob:'].includes(url.protocol)) return;
      const local = url.origin.match(LOCAL_TEST_ORIGIN);
      const ok = url.origin === apiOrigin || url.origin === 'https://cdnjs.cloudflare.com' ||
        (local && Number(local[1]) > PORT_BASE && Number(local[1]) <= PORT_BASE + 12);
      if (!ok) problems.push(`unexpected request to ${url.origin}`);
    });
    await use(page);
    expect(problems.filter(p => !allowed.some(re => re.test(p))), 'page errors, console errors or unexpected requests').toEqual([]);
  },
});
export {expect};

export async function signIn(page, portal, identifier = DEMO[portal], password = DEMO_PASSWORD) {
  await page.goto(portalUrl(portal));
  await page.locator('input[name=identifier]').fill(identifier);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', {name: 'Continue to workspace'}).click();
}

export async function signedIn(page, portal, identifier, password) {
  await signIn(page, portal, identifier, password);
  await expect(page.locator('#nav')).toBeVisible();
  await settled(page);
}

// Waits until the current page has replaced its loading placeholders.
export async function settled(page) {
  await expect(page.locator('#view .skeleton-card')).toHaveCount(0);
}

export async function go(page, label) {
  await page.locator(`#nav button[data-page="${label}"]`).click();
  await expect(page.locator(`#nav button[data-page="${label}"]`)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(`#view.page-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)).toBeVisible();
  await settled(page);
}

export const card = (page, title) => page.locator('.card').filter({has: page.locator('h3', {hasText: title})});
export const dialog = page => page.locator('.modal');
export const lastToast = page => page.locator('.toast').last();

export async function expectToast(page, text) {
  await expect(page.locator('.toast', {hasText: text}).first()).toBeVisible();
}

export async function apiToken(request, identifier, password = DEMO_PASSWORD) {
  const r = await request.post(API + '/auth/login', {data: {identifier, password}});
  expect(r.status(), `login ${identifier}`).toBe(200);
  return (await r.json()).access_token;
}

export const apiAs = (request, token) => ({
  get: p => request.get(API + p, {headers: {Authorization: `Bearer ${token}`}}),
  post: (p, data) => request.post(API + p, {headers: {Authorization: `Bearer ${token}`}, data}),
  put: (p, data) => request.put(API + p, {headers: {Authorization: `Bearer ${token}`}, data}),
  del: p => request.delete(API + p, {headers: {Authorization: `Bearer ${token}`}}),
});
