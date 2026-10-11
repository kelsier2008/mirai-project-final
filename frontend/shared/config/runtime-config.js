// Deployment settings for one portal build.
//
// This file holds the DEVELOPMENT defaults used when the source is served directly
// (scripts/run_local.sh). `frontend/scripts/build-portal.mjs` replaces it in every build
// with values from MIRAI_API_BASE_URL and the other MIRAI_* variables, so production
// builds never fall back to this computer's address and never contain demo logins.
//
// Everything here is visible to anyone who opens the site: never put a secret in it.

// The local launcher runs the API on port 8000 of the computer serving the page, so a
// phone on the same network reaches it at the address it used to open the portal.
const devApi = () => {
  const l = globalThis.location;
  return l ? `${l.protocol === 'https:' ? 'https:' : 'http:'}//${l.hostname || 'localhost'}:8000` : '';
};

export const runtimeConfig = Object.freeze({
  environment: 'development',
  apiBaseUrl: devApi(),
  // The sign-in screen's "Connection settings" can point at another API (LAN testing).
  allowApiOverride: true,
  // Demo accounts created by backend/scripts/seed.py. Development and demo builds only.
  demoPassword: 'password123',
  demoLogins: [
    ['s001@demo.edu', 'student', 'Student'],
    ['n001@demo.edu', 'student', 'Student, another campus'],
    ['coord@demo.edu', 'coordinator', 'Coordinator'],
    ['advisor@demo.edu', 'advisor', 'Advisor'],
    ['admin@demo.edu', 'campus_admin', 'Campus manager'],
    ['super@demo.edu', 'super_admin', 'Super admin'],
  ],
  // Where each portal lives, keyed by portal id. Used to point a signed-in user at the
  // right portal for their role. Locally every portal is served next to the others.
  portalUrls: {
    'super-admin': '../super-admin/',
    'campus-manager': '../campus-manager/',
    advisor: '../advisor/',
    coordinator: '../coordinator/',
    student: '../student/',
  },
});
