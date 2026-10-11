// Addresses shared by the global setup and the tests.
export const API = (process.env.MIRAI_E2E_API || 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const PORT_BASE = Number(process.env.MIRAI_E2E_PORT_BASE || 5600);
export const PORTAL_IDS = ['super-admin', 'campus-manager', 'advisor', 'coordinator', 'student'];
export const portalPort = id => PORT_BASE + 1 + PORTAL_IDS.indexOf(id);
export const portalUrl = id => `http://127.0.0.1:${portalPort(id)}/`;
export const OFFLINE_URL = `http://127.0.0.1:${PORT_BASE + 10}/`;
export const OUTSIDER_URL = `http://127.0.0.1:${PORT_BASE + 11}/`;
// The unbuilt source, served like scripts/run_local.sh does (development config).
export const DEV_URL = `http://127.0.0.1:${PORT_BASE + 12}/`;

// Accounts from backend/scripts/seed.py (development data only).
export const DEMO_PASSWORD = 'password123';
export const DEMO = {
  'super-admin': 'super@demo.edu',
  'campus-manager': 'admin@demo.edu',
  advisor: 'advisor@demo.edu',
  coordinator: 'coord@demo.edu',
  student: 's001@demo.edu',
};
export const ROLE = {
  'super-admin': 'super_admin', 'campus-manager': 'campus_admin', advisor: 'advisor', coordinator: 'coordinator', student: 'student',
};
export const TITLE = {
  'super-admin': 'Super Admin Portal', 'campus-manager': 'Campus Manager Portal', advisor: 'Advisor Portal',
  coordinator: 'Coordinator Portal', student: 'Student Portal',
};
