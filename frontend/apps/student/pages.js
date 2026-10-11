import {studentCertificatesPage} from '../../shared/features/certificates/student-certificates.js';
import {studentCheckinPage} from '../../shared/features/checkin/student-checkin.js';
import {studentDaysPage} from '../../shared/features/club-days/student-days.js';
import {studentClubsPage} from '../../shared/features/clubs/student-clubs.js';
import {createEventsPage} from '../../shared/features/events/events-page.js';
import {studentEventExtensions} from '../../shared/features/events/student-events.js';
import {studentHome} from '../../shared/features/home/student-home.js';
import {notificationsPage} from '../../shared/features/notifications/inbox.js';
import {studentRecordsPage} from '../../shared/features/records/student-records.js';
import {submitPage} from '../../shared/features/submissions/student-submit.js';

// The Student Portal's pages, in navigation order. Only modules imported here (and what they
// import) are published in this portal's build.
export const pages=Object.freeze({
  Home:studentHome,
  Clubs:studentClubsPage,
  Days:studentDaysPage,
  'Check-in':studentCheckinPage,
  Submit:submitPage,
  Certs:studentCertificatesPage,
  Events:createEventsPage(studentEventExtensions),
  Records:studentRecordsPage,
  Notifications:notificationsPage,
});
