import {runtimeConfig} from '../../shared/config/runtime-config.js';
import {portalById} from '../../shared/config/portals.js';

// Everything a campus manager has, across every campus, plus campus creation and the
// campus comparison on the dashboard.
const {id,role,title}=portalById('super-admin');
export const portalConfig=Object.freeze({
  portalId:id,
  // Canonical backend role (backend/app/core/permissions.py). Any other role is turned away.
  expectedRole:role,
  title,
  spaceLabel:'Super admin console',
  identifierLabel:'Email',
  loginIntro:'For program managers. Every campus, club and account is managed here.',
  // Navigation order; the first page is home. pages.js supplies one renderer per entry.
  pages:Object.freeze(['Dashboard', 'Administration', 'Clubs', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Duty Leave', 'Records', 'Notification log', 'Notifications']),
  // Page subtitles that differ from shared/navigation/page-meta.js.
  subtitles:Object.freeze({}),
  // The one shared API, set at build time (MIRAI_API_BASE_URL). The API client reads the same value.
  apiBaseUrl:runtimeConfig.apiBaseUrl,
});
