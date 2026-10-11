import {budgetsPage} from '../../shared/features/budgets/budgets.js';
import {staffCertificatesPage} from '../../shared/features/certificates/staff-certificates.js';
import {staffCheckinPage} from '../../shared/features/checkin/staff-checkin.js';
import {plannerPage} from '../../shared/features/club-days/planner.js';
import {createDashboardPage} from '../../shared/features/dashboard/dashboard.js';
import {createEventsPage} from '../../shared/features/events/events-page.js';
import {staffEventExtensions} from '../../shared/features/events/staff-events.js';
import {staffHome} from '../../shared/features/home/staff-home.js';
import {notificationsPage} from '../../shared/features/notifications/inbox.js';
import {gradingPage} from '../../shared/features/submissions/grading.js';

// The Advisor Portal's pages, in navigation order. Only modules imported here (and what they
// import) are published in this portal's build.
export const pages=Object.freeze({
  Home:staffHome,
  Days:plannerPage,
  'Check-in':staffCheckinPage,
  Grading:gradingPage,
  Certs:staffCertificatesPage,
  Events:createEventsPage(staffEventExtensions),
  Budgets:budgetsPage,
  Dashboard:createDashboardPage(),
  Notifications:notificationsPage,
});
