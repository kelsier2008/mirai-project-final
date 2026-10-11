import {fmt} from '../../core/format.js';

// ---------- notification text ----------
export const KIND={'club_day.announced':'Club Day announced','club_day.upcoming':'Club Day reminder','club_day.rescheduled':'Club Day rescheduled','club_day.plan_due':'Club Day plan due','club_day.plan_submitted':'Plan submitted for approval','club_day.plan_approved':'Plan approved','club_day.plan_rejected':'Plan needs changes','submission.deadline_soon':'Submission deadline soon','submission.resubmission_requested':'Resubmission requested','event.rescheduled':'Event rescheduled','event.upcoming':'Event reminder','budget.approved':'Budget approved','budget.rejected':'Budget rejected','campus.monthly_report':'Monthly campus report'};
export const kindLabel=k=>KIND[k]||String(k).replaceAll('_',' ').replaceAll('.',' · ');
export function noticeText(n){const p=n.payload||{},parts=[];const what=[p.club_name,p.title].filter(Boolean).join(' · ');if(what)parts.push(what);
 if(n.kind==='club_day.rescheduled')parts.push(`moved from ${fmt.date(p.previous_day_date)} to ${fmt.date(p.day_date)}${p.start_time?' at '+p.start_time+(p.end_time?'–'+p.end_time:''):''}`);
 else if(n.kind==='event.rescheduled')parts.push(`moved from ${fmt.dt(p.previous_starts_at)} to ${fmt.dt(p.starts_at)}`);
 else{if(p.day_date)parts.push(fmt.date(p.day_date)+(p.start_time?' · '+p.start_time+(p.end_time?'–'+p.end_time:''):''));if(p.starts_at)parts.push(fmt.dt(p.starts_at))}
 if(p.topic)parts.push('Topic: '+p.topic);if(p.venue)parts.push('Venue: '+p.venue);if(p.deliverable)parts.push('Deliverable: '+p.deliverable);if(p.deadline)parts.push('Due '+fmt.dt(p.deadline));
 if(p.amount)parts.push(`${p.currency||''} ${Number(p.amount).toLocaleString()}`.trim()+(p.decided_by_name?` · decided by ${p.decided_by_name}`:''));
 if(p.comment)parts.push('Feedback: '+p.comment);if(p.reason)parts.push('Reason: '+p.reason);
 if(p.month)parts.push(`${p.month}: ${fmt.n(p.club_days||0)} Club Days, ${fmt.n(p.attendance_records||0)} check-ins, ${fmt.n(p.submissions||0)} submissions, ${fmt.pct(p.attendance_percentage||0)} attendance`);
 return parts.join(' — ')}
