import { fmt } from './format';
import type { NotificationDto } from '../api/types';

const KIND: Record<string, string> = {
  'club_day.announced': 'Club Day announced', 'club_day.upcoming': 'Club Day reminder', 'club_day.rescheduled': 'Club Day rescheduled',
  'club_day.plan_due': 'Club Day plan due', 'club_day.plan_submitted': 'Plan submitted for approval', 'club_day.plan_approved': 'Plan approved',
  'club_day.plan_rejected': 'Plan needs changes', 'submission.deadline_soon': 'Submission deadline soon',
  'submission.resubmission_requested': 'Resubmission requested', 'event.rescheduled': 'Event rescheduled', 'event.upcoming': 'Event reminder',
  'budget.approved': 'Budget approved', 'budget.rejected': 'Budget rejected', 'campus.monthly_report': 'Monthly campus report',
};
export const kindLabel = (k: string) => KIND[k] ?? k.replaceAll('_', ' ').replaceAll('.', ' · ');

type P = Record<string, string | number | undefined>;
export function noticeText(n: NotificationDto): string {
  const p = (n.payload ?? {}) as P;
  const parts: string[] = [];
  const str = (v: unknown) => String(v);
  const range = () => (p.start_time ? ` at ${p.start_time}${p.end_time ? '–' + p.end_time : ''}` : '');
  const what = [p.club_name, p.title].filter(Boolean).join(' · ');
  if (what) parts.push(what);
  if (n.kind === 'club_day.rescheduled') parts.push(`moved from ${fmt.date(str(p.previous_day_date))} to ${fmt.date(str(p.day_date))}${range()}`);
  else if (n.kind === 'event.rescheduled') parts.push(`moved from ${fmt.dt(str(p.previous_starts_at))} to ${fmt.dt(str(p.starts_at))}`);
  else {
    if (p.day_date) parts.push(fmt.date(str(p.day_date)) + (p.start_time ? ` · ${p.start_time}${p.end_time ? '–' + p.end_time : ''}` : ''));
    if (p.starts_at) parts.push(fmt.dt(str(p.starts_at)));
  }
  if (p.topic) parts.push('Topic: ' + p.topic);
  if (p.venue) parts.push('Venue: ' + p.venue);
  if (p.deliverable) parts.push('Deliverable: ' + p.deliverable);
  if (p.deadline) parts.push('Due ' + fmt.dt(str(p.deadline)));
  if (p.amount) parts.push(`${p.currency ?? ''} ${Number(p.amount).toLocaleString()}`.trim() + (p.decided_by_name ? ` · decided by ${p.decided_by_name}` : ''));
  if (p.comment) parts.push('Feedback: ' + p.comment);
  if (p.reason) parts.push('Reason: ' + p.reason);
  return parts.join(' — ');
}
