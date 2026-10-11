import {createAdministrationPage} from '../../shared/features/admin/administration.js';
import {budgetsPage} from '../../shared/features/budgets/budgets.js';
import {staffCertificatesPage} from '../../shared/features/certificates/staff-certificates.js';
import {staffCheckinPage} from '../../shared/features/checkin/staff-checkin.js';
import {plannerPage} from '../../shared/features/club-days/planner.js';
import {clubRegistryPage} from '../../shared/features/clubs/club-registry.js';
import {membershipRequestsPage} from '../../shared/features/clubs/membership-requests.js';
import {createDashboardPage} from '../../shared/features/dashboard/dashboard.js';
import {dutyLeavePage} from '../../shared/features/duty-leave/duty-leave.js';
import {createEventsPage} from '../../shared/features/events/events-page.js';
import {staffEventExtensions} from '../../shared/features/events/staff-events.js';
import {notificationsPage} from '../../shared/features/notifications/inbox.js';
import {notificationLogPage} from '../../shared/features/notifications/notification-log.js';
import {transcriptLookupPage} from '../../shared/features/records/transcript-lookup.js';
import {gradingPage} from '../../shared/features/submissions/grading.js';

// The Campus Manager Portal's pages, in navigation order. Only modules imported here (and what they
// import) are published in this portal's build.
export const pages=Object.freeze({
  Dashboard:createDashboardPage(),
  Administration:createAdministrationPage(),
  Clubs:clubRegistryPage,
  Members:membershipRequestsPage,
  Days:plannerPage,
  'Check-in':staffCheckinPage,
  Grading:gradingPage,
  Certs:staffCertificatesPage,
  Events:createEventsPage(staffEventExtensions),
  Budgets:budgetsPage,
  'Duty Leave':dutyLeavePage,
  Records:transcriptLookupPage,
  'Notification log':notificationLogPage,
  Notifications:notificationsPage,
});
