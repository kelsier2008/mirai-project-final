export const fmt = {
  n: (v: unknown) => (v == null || v === '' ? '—' : Number(v).toLocaleString()),
  date: (v?: string | null) => {
    if (!v) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  },
  dt: (v?: string | null) =>
    v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—',
  clock: (v?: string | null) => (v ? new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'),
  time: (v?: string | null) => (v ? String(v).slice(0, 5) : ''),
};
export const dayWhen = (d: { day_date: string; start_time: string | null; end_time: string | null }) =>
  `${fmt.date(d.day_date)}${d.start_time ? ` · ${fmt.time(d.start_time)}${d.end_time ? '–' + fmt.time(d.end_time) : ''}` : ''}`;

const STATUS: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', planned: 'Planned', announced: 'Announced', open: 'Open',
  submissions: 'Submissions open', evaluating: 'Evaluating', closed: 'Closed', draft: 'Draft', submitted: 'Submitted', live: 'Live',
  checked_in: 'Checked in', not_submitted: 'Not submitted', graded: 'Graded', resubmission_requested: 'Resubmission requested',
  ready: 'Ready', failed: 'Failed', generating: 'Generating', registered: 'Registered', read: 'Read', unread: 'Unread',
  outdated: 'Outdated', rescheduled: 'Rescheduled', sent: 'Sent', cancelled: 'Cancelled', late: 'Late', active: 'Active', inactive: 'Deactivated',
};
export const statusLabel = (s: string) => STATUS[s.toLowerCase()] ?? s.replaceAll('_', ' ');
export type Tone = 'good' | 'alert' | 'wait' | 'neutral' | 'info';
export function statusTone(s: string): Tone {
  const k = s.toLowerCase();
  if (/approved|ready|closed|issued|verified|accepted|graded|checked_in|sent|active/.test(k)) return 'good';
  if (/rejected|failed|revoked|late|resubmission|inactive/.test(k)) return 'alert';
  if (/pending|open|generating|submissions|evaluating|submitted/.test(k)) return 'wait';
  if (/announced|registered|unread|rescheduled/.test(k)) return 'info';
  return 'neutral';
}
