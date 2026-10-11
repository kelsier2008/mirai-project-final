// End-to-end tests: the five built portals against a real Mirai API and database.
//
//   1. Start the backend with the demo data, e.g. ./scripts/run_local.sh --demo
//      (or any test stack). Never point this at production data.
//   2. cd frontend && npm ci && npx playwright install chromium
//   3. MIRAI_E2E_API=http://127.0.0.1:8000 npm run test:e2e
//
// The global setup builds every portal for that API and serves each on its own origin
// (ports 5601-5605 by default, like five separate Cloudflare Pages projects) and the
// unbuilt source on port 5612. With CORS_ORIGINS=* every test runs; to include the
// strict-CORS check, list exactly http://127.0.0.1:5601 ... 5605 and 5612.
import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {timeout: 15_000},
  outputDir: './test-results',
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
});
