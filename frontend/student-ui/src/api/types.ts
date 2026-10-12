// Shapes returned by the Mirai API (see docs/API_NOTES.md) plus UI-level models.

export interface UserProfile {
  id: number;
  role: string;
  campus_id: number | null;
  name: string;
  email: string | null;
  student_code: string | null;
  campus_name: string | null;
  permissions: string[];
}
export interface LoginResponse { access_token: string; token_type: 'bearer'; user: UserProfile }

/** GET /club-days row (subset). */
export interface ClubDayDto {
  id: number;
  club_id: number;
  club_name: string;
  title: string | null;
  plan_topic?: string | null;
  plan_venue?: string | null;
  day_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  status: string;
}
/** GET /checkin/attendance/me row. */
export interface AttendanceDto {
  id: number; session_id: number; club_day_id: number; checked_in_at: string; is_late: boolean;
  day_date: string; title: string | null; club_name: string;
}

export interface AcademicProfile { program: string; batch: string; semester: string }

export type EventAttendance = 'Present' | 'Absent' | 'Upcoming';
export interface EventItem {
  id: string;
  kind: string; // "Lecture"
  attendance: EventAttendance;
  start: string; // "9:00 AM"
  end: string;
  title: string;
  category: string; // "Core"
  mode: string; // "Offline"
}
export interface AttendanceSummary { present: number; absent: number }
export interface HighlightItem { id: string; image: string; alt: string }
export interface Subject {
  id: string; title: string; subtitle: string; type: 'Core';
  tone: 'blue' | 'purple' | 'mint'; art: 'books' | 'tablet' | 'envelope' | 'notepad' | 'pen' | 'check';
}
export interface Assignment { id: string; subjectId: string; subject: string; title: string; dueInDays: number }
export type FaqCategoryId = 'eligibility' | 'selection' | 'program' | 'scholarship' | 'internships' | 'placements';
export interface FaqCategory { id: FaqCategoryId; label: string }
export interface Faq { id: string; category: FaqCategoryId; question: string; answer: string }

/** Result wrapper so the UI can tell real API data from placeholders. */
export interface Sourced<T> { data: T; source: 'api' | 'mock' }
