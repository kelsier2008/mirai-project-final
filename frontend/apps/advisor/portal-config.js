import {runtimeConfig} from '../../shared/config/runtime-config.js';
import {portalById} from '../../shared/config/portals.js';

// Faculty advisors: plan approval, attendance and grading views for the clubs they advise.
const {id,role,title}=portalById('advisor');
export const portalConfig=Object.freeze({
  portalId:id,
  // Canonical backend role (backend/app/core/permissions.py). Any other role is turned away.
  expectedRole:role,
  title,
  spaceLabel:'Advisor console',
  identifierLabel:'Email',
  loginIntro:'For faculty advisors. You see the clubs you advise.',
  // Navigation order; the first page is home. pages.js supplies one renderer per entry.
  pages:Object.freeze(['Home', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Dashboard', 'Notifications']),
  // Page subtitles that differ from shared/navigation/page-meta.js.
  subtitles:Object.freeze({}),
  // The one shared API, set at build time (MIRAI_API_BASE_URL). The API client reads the same value.
  apiBaseUrl:runtimeConfig.apiBaseUrl,
});
