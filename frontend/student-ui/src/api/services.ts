// Typed service layer. Pages/components call these functions, never fetch directly.
// Each screen function returns { data, source } so the UI can tell API data from mocks.
import { request, ApiError } from './client';
import { EXPECTED_ROLE } from './config';
import type {
  AcademicProfile, AttendanceDto, AttendanceSummary, Assignment, ClubDayDto, EventItem, Faq, HighlightItem,
  LoginResponse, Sourced, Subject, UserProfile,
} from './types';
import {
  mockAcademic, mockAssignments, mockAttendance, mockEvents, mockFaqs, mockHighlights, mockSubjects,
} from '../data/mock';

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
// GET /checkin/attendance/me. Falls back to mock when empty or the call fails.
export async function getEvents(): Promise<Sourced<EventItem[]>> {
  try {
    const [days, att] = await Promise.all([
      request<ClubDayDto[]>('GET', '/club-days?upcoming=true'),
      request<AttendanceDto[]>('GET', '/checkin/attendance/me'),
    ]);
    if (days.length === 0) return { data: mockEvents, source: 'mock' };
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
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    return { data: mockEvents, source: 'mock' };
  }
}

// ---------- attendance donut ----------
// The API has no attendance percentage. Present = distinct Club Days with a check-in;
// Absent = past visible Club Days with none. Falls back to mock when there is no history.
export async function getAttendanceSummary(): Promise<Sourced<AttendanceSummary>> {
  try {
    const [att, days] = await Promise.all([
      request<AttendanceDto[]>('GET', '/checkin/attendance/me'),
      request<ClubDayDto[]>('GET', '/club-days'),
    ]);
    const today = todayIso();
    const past = days.filter((d) => d.day_date < today && d.status !== 'draft');
    const attended = new Set(att.map((a) => a.club_day_id));
    const present = past.filter((d) => attended.has(d.id)).length;
    const absent = past.length - present;
    if (past.length === 0) return { data: mockAttendance, source: 'mock' };
    return { data: { present, absent }, source: 'api' };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    return { data: mockAttendance, source: 'mock' };
  }
}

// ---------- highlights / subjects / assignments / FAQs ----------
// TODO(api): none of these have backend endpoints yet.
export async function getHighlights(): Promise<Sourced<HighlightItem[]>> { return { data: mockHighlights, source: 'mock' }; }
export async function getSubjects(): Promise<Sourced<Subject[]>> { return { data: mockSubjects, source: 'mock' }; }
export async function getAssignments(): Promise<Sourced<Assignment[]>> { return { data: mockAssignments, source: 'mock' }; }
export async function getFaqs(): Promise<Sourced<Faq[]>> { return { data: mockFaqs, source: 'mock' }; }
