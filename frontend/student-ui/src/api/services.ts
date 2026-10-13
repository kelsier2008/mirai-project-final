// Typed service layer. Pages/components call these functions, never fetch directly.
// Each screen function returns { data, source } so the UI can tell API data from mocks.
import { request } from './client';
import { API_BASE_URL } from './config';
import { EXPECTED_ROLE } from './config';
import type {
  AcademicProfile, AttendanceDto, AttendanceSummary, Assignment, ClubDayDto, EventItem, Faq, HighlightItem,
  LoginResponse, Sourced, Subject, UserProfile,
} from './types';
import { mockAcademic, mockAssignments, mockFaqs, mockHighlights, mockSubjects } from '../data/mock';

// ---------- auth (real API) ----------
export const login = (identifier: string, password: string) =>
  request<LoginResponse>('POST', '/auth/login', { identifier, password });
export const fetchMe = () => request<UserProfile>('GET', '/auth/me');
export const isStudent = (u: UserProfile) => u.role === EXPECTED_ROLE;

// ---------- helpers ----------
const todayIso = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function clock(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ---------- academic profile ----------
// TODO(api): no endpoint; mocked.
export async function getAcademicProfile(): Promise<Sourced<AcademicProfile>> {
  return { data: mockAcademic, source: 'mock' };
}

// ---------- events (Home) ----------
// Real source: GET /club-days?upcoming=true (the student's clubs' sessions), attendance via
// GET /checkin/attendance/me. Errors surface in the card's error state; no mock fallback.
export async function getEvents(): Promise<Sourced<EventItem[]>> {
  const [days, att] = await Promise.all([
    request<ClubDayDto[]>('GET', '/club-days?upcoming=true'),
    request<AttendanceDto[]>('GET', '/checkin/attendance/me'),
  ]);
  const attended = new Set(att.map((a) => a.club_day_id));
  const today = todayIso();
  const data: EventItem[] = days.slice(0, 3).map((d) => ({
    id: String(d.id),
    kind: 'Club Day',
    attendance: attended.has(d.id) ? 'Present' : d.day_date < today ? 'Absent' : 'Upcoming',
    start: clock(d.start_time),
    end: clock(d.end_time),
    title: d.title || d.plan_topic || d.club_name,
    category: d.club_name,
    mode: d.plan_venue ? 'Offline' : 'Online',
  }));
  return { data, source: 'api' };
}

// ---------- attendance donut ----------
// The API has no attendance percentage. Present = past visible Club Days with a check-in;
// Absent = past visible Club Days without one.
export async function getAttendanceSummary(): Promise<Sourced<AttendanceSummary>> {
  const [att, days] = await Promise.all([
    request<AttendanceDto[]>('GET', '/checkin/attendance/me'),
    request<ClubDayDto[]>('GET', '/club-days'),
  ]);
  const today = todayIso();
  const past = days.filter((d) => d.day_date < today && d.status !== 'draft');
  const attended = new Set(att.map((a) => a.club_day_id));
  const present = past.filter((d) => attended.has(d.id)).length;
  return { data: { present, absent: past.length - present }, source: 'api' };
}

// ---------- highlights / subjects / assignments / FAQs ----------
// TODO(api): none of these have backend endpoints yet.
export async function getHighlights(): Promise<Sourced<HighlightItem[]>> { return { data: mockHighlights, source: 'mock' }; }
export async function getSubjects(): Promise<Sourced<Subject[]>> { return { data: mockSubjects, source: 'mock' }; }
export async function getAssignments(): Promise<Sourced<Assignment[]>> { return { data: mockAssignments, source: 'mock' }; }
export async function getFaqs(): Promise<Sourced<Faq[]>> { return { data: mockFaqs, source: 'mock' }; }

// ======================= club tracker modules (real API, no mock fallback) =======================
import { downloadFile, requestBlob } from './client';
import type {
  CertificateDto, CheckinSessionDto, ClubDayFull, ClubDto, EventDto, EventMediaDto, EventResultDto,
  MembershipDto, MembershipType, NotificationList, PrefDto, SubmissionDto, TranscriptDto,
} from './types';

export { downloadFile, requestBlob };

// clubs & memberships
export const listClubs = () => request<ClubDto[]>('GET', '/clubs');
export const listMemberships = () => request<MembershipDto[]>('GET', '/memberships/me');
export const joinClub = (id: number, type: MembershipType) => request<unknown>('POST', `/clubs/${id}/join`, { type });

// club days
export const listClubDays = () => request<ClubDayFull[]>('GET', '/club-days');

// check-in
export const getCheckinSession = (id: string | number) => request<CheckinSessionDto>('GET', `/checkin/sessions/${id}`);
export const listMyAttendance = () => request<AttendanceDto[]>('GET', '/checkin/attendance/me');
export const scanCheckin = (body: { session_id: number; token: string; lat?: number; lng?: number }) =>
  request<{ is_late: boolean }>('POST', '/checkin/scan', body);

// submissions
export const listSubmissions = (dayId: string | number) => request<SubmissionDto[]>('GET', `/club-days/${dayId}/submissions`);
export const uploadSubmission = (dayId: string | number, kind: string, file: File) => {
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('file', file);
  return request<unknown>('POST', `/club-days/${dayId}/submissions/file`, fd);
};
export const submitLink = (dayId: string | number, url: string) => request<unknown>('POST', `/club-days/${dayId}/submissions/link`, { url });

// certificates
export const listCertificates = () => request<CertificateDto[]>('GET', '/certificates/me');
export const claimCertificate = (club_day_id: number) => request<unknown>('POST', '/certificates/participation', { club_day_id });
export const certificateVerifyUrl = (id: string) => `${API_BASE_URL}/verify/${id}`;

// events
export const listEvents = () => request<EventDto[]>('GET', '/events');
export const getEvent = (id: number) => request<EventDto>('GET', `/events/${id}`);
export const getEventResults = (id: number) => request<EventResultDto[]>('GET', `/events/${id}/results`);
export const getEventMedia = (id: number) => request<EventMediaDto[]>('GET', `/events/${id}/media`);
export const registerEvent = (id: number) => request<unknown>('POST', `/events/${id}/register`);
export const unregisterEvent = (id: number) => request<unknown>('DELETE', `/events/${id}/register`);
export const createTeam = (id: number, name: string) => request<unknown>('POST', `/events/${id}/teams`, { name });
export const joinTeam = (id: number, teamId: number) => request<unknown>('POST', `/events/${id}/teams/${teamId}/join`);
export const leaveTeam = (id: number) => request<unknown>('POST', `/events/${id}/teams/leave`);
export const claimEventCertificate = (id: number) =>
  request<{ already_issued?: boolean }>('POST', `/events/${id}/certificates/participation/claim`);
export const uploadEventPhoto = (id: number, file: File, consent: boolean) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('consent_to_publish', String(consent));
  return request<unknown>('POST', `/events/${id}/media`, fd);
};
export const setPhotoConsent = (id: number, mediaId: number, consent: boolean) =>
  request<unknown>('PUT', `/events/${id}/media/${mediaId}/consent`, { consent_to_publish: consent });

// records
export const getTranscript = () => request<TranscriptDto>('GET', '/transcripts/me');
export const verifyTranscript = (snapshot: unknown, signature: unknown) =>
  request<{ valid: boolean }>('POST', '/api/transcripts/verify', { snapshot, signature });

// notifications
export const listNotifications = (limit = 100) => request<NotificationList>('GET', `/notifications?limit=${limit}`);
export const markNotificationRead = (id: number) => request<unknown>('POST', `/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => request<unknown>('POST', '/notifications/read-all', {});
export const getEmailPref = () => request<PrefDto>('GET', '/notifications/email-preference');
export const setEmailPref = (enabled: boolean) => request<PrefDto>('PUT', '/notifications/email-preference', { enabled });
export const getWhatsappPref = () => request<PrefDto>('GET', '/notifications/whatsapp-preference');
export const setWhatsappPref = (b: { phone_e164: string | null; enabled: boolean; consent: boolean }) =>
  request<PrefDto>('PUT', '/notifications/whatsapp-preference', b);
