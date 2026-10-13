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

// ---------- club tracker DTOs (student scope) ----------
export type MembershipType = 'primary' | 'secondary';
export interface ClubDto {
  id: number; name: string; description: string | null; capacity: number; approved_count: number;
  advisor_name: string | null; campus_name?: string | null;
}
export interface MembershipDto { id: number; club_id: number; club_name: string; type: MembershipType; status: string; created_at: string }
export interface ClubDayFull extends ClubDayDto {
  schedule_version: number; plan_format: string | null; plan_deliverable: string | null; submission_deadline: string | null;
}
export interface CheckinSessionDto {
  id: number; status: string; club_name: string; club_day_title: string | null; day_date: string;
  start_time: string | null; end_time: string | null; closes_at: string | null;
  my_checkin: { checked_in_at: string; is_late: boolean; geo_flag: boolean } | null;
}
export interface EvaluationDto { status: string; total: number | null; max_total: number | null; comment: string | null }
export interface SubmissionDto {
  id: number; kind: 'file' | 'photo' | 'link'; url?: string; original_filename?: string; submitted_at: string;
  is_late: boolean; evaluation: EvaluationDto | null;
}
export interface CertificateDto { id: string; kind: string; status: string; revoked?: boolean; student_name?: string; title?: string }
export interface TeamDto { id: number; name: string; members: { student_name: string }[] }
export interface EventDto {
  id: number; name: string; type: string; capacity: number; registered: number; starts_at: string | null;
  is_inter_college: boolean; approved_at: string | null; schedule_version: number; team_size?: number | null;
  my_registered?: boolean; my_team?: { id: number; name: string } | null; teams?: TeamDto[];
}
export interface EventResultDto { rank: number; team_name?: string; student_name?: string; notes?: string }
export interface EventMediaDto { id: number; original_filename: string; moderation_status: string; consent_to_publish: boolean; uploaded_by: number }
export interface NotificationDto {
  id: number; kind: string; payload: Record<string, unknown> | null; send_at: string; read_at: string | null;
  cancelled_at: string | null; deliveries: { channel: string; status: string }[];
}
export interface NotificationList { unread_count: number; items: NotificationDto[] }
export interface PrefDto { enabled: boolean; available?: boolean; phone_last4?: string | null }
export interface TranscriptDto {
  totals: Record<string, number | null>;
  memberships?: { club_name: string; type: string }[];
  club_days: Record<string, unknown>[];
  events: Record<string, unknown>[];
}
