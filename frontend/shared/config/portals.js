// The five portals and the canonical backend role each one serves. Role strings come
// from backend/app/core/permissions.py (ROLES) and must not change here.
// The build script, every portal-config.js and the tests read this list.
export const PORTALS = Object.freeze([
  Object.freeze({ id: 'super-admin', role: 'super_admin', title: 'Super Admin Portal' }),
  Object.freeze({ id: 'campus-manager', role: 'campus_admin', title: 'Campus Manager Portal' }),
  Object.freeze({ id: 'advisor', role: 'advisor', title: 'Advisor Portal' }),
  Object.freeze({ id: 'coordinator', role: 'coordinator', title: 'Coordinator Portal' }),
  Object.freeze({ id: 'student', role: 'student', title: 'Student Portal' }),
]);

export const portalById = id => PORTALS.find(p => p.id === id) || null;
export const portalForRole = role => PORTALS.find(p => p.role === role) || null;
