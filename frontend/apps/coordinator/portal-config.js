import {runtimeConfig} from '../../shared/config/runtime-config.js';
import {portalById} from '../../shared/config/portals.js';

// Club coordinators: memberships, Club Days, check-in and grading for their clubs.
const {id,role,title}=portalById('coordinator');
export const portalConfig=Object.freeze({
  portalId:id,
  // Canonical backend role (backend/app/core/permissions.py). Any other role is turned away.
  expectedRole:role,
  title,
  spaceLabel:'Coordinator console',
  identifierLabel:'Email',
  loginIntro:'For club coordinators. You see the clubs you coordinate.',
  // Navigation order; the first page is home. pages.js supplies one renderer per entry.
  pages:Object.freeze(['Home', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications']),
  // Page subtitles that differ from shared/navigation/page-meta.js.
  subtitles:Object.freeze({}),
  // The one shared API, set at build time (MIRAI_API_BASE_URL). The API client reads the same value.
  apiBaseUrl:runtimeConfig.apiBaseUrl,
});
