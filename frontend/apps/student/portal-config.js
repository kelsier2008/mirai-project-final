import {runtimeConfig} from '../../shared/config/runtime-config.js';
import {portalById} from '../../shared/config/portals.js';

// Students: clubs, Club Days, check-in, submissions, certificates, events and their own record.
const {id,role,title}=portalById('student');
export const portalConfig=Object.freeze({
  portalId:id,
  // Canonical backend role (backend/app/core/permissions.py). Any other role is turned away.
  expectedRole:role,
  title,
  spaceLabel:'Student space',
  identifierLabel:'Email or student ID',
  loginIntro:'Sign in with your student email or student ID.',
  // Navigation order; the first page is home. pages.js supplies one renderer per entry.
  pages:Object.freeze(['Home', 'Clubs', 'Days', 'Check-in', 'Submit', 'Certs', 'Events', 'Records', 'Notifications']),
  // Page subtitles that differ from shared/navigation/page-meta.js.
  subtitles:Object.freeze({'Check-in': 'Check in with the code on the screen and see your saved attendance.', 'Days': 'Club Days announced for your clubs.', 'Clubs': 'Find a club and request to join.'}),
  // The one shared API, set at build time (MIRAI_API_BASE_URL). The API client reads the same value.
  apiBaseUrl:runtimeConfig.apiBaseUrl,
});
