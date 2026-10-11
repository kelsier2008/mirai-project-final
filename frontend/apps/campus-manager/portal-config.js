import {runtimeConfig} from '../../shared/config/runtime-config.js';
import {portalById} from '../../shared/config/portals.js';

// Campus-level administration. The API limits every request to the manager's own campus.
const {id,role,title}=portalById('campus-manager');
export const portalConfig=Object.freeze({
  portalId:id,
  // Canonical backend role (backend/app/core/permissions.py). Any other role is turned away.
  expectedRole:role,
  title,
  spaceLabel:'Campus manager console',
  identifierLabel:'Email',
  loginIntro:'For campus managers. You see and manage your own campus.',
  // Navigation order; the first page is home. pages.js supplies one renderer per entry.
  pages:Object.freeze(['Dashboard', 'Administration', 'Clubs', 'Members', 'Days', 'Check-in', 'Grading', 'Certs', 'Events', 'Budgets', 'Duty Leave', 'Records', 'Notification log', 'Notifications']),
  // Page subtitles that differ from shared/navigation/page-meta.js.
  subtitles:Object.freeze({}),
  // The one shared API, set at build time (MIRAI_API_BASE_URL). The API client reads the same value.
  apiBaseUrl:runtimeConfig.apiBaseUrl,
});
