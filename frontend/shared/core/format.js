export const fmt={
 n:v=>v==null||v===''?'—':Number(v).toLocaleString(),
 pct:v=>v==null?'—':`${Number(v).toLocaleString(undefined,{maximumFractionDigits:1})}%`,
 score:v=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2}),
 date:v=>{if(!v)return'—';const d=/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T00:00:00'):new Date(v);return isNaN(d)?String(v):d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})},
 dt:v=>v?new Date(v).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—',
 clock:v=>v?new Date(v).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'—',
 time:v=>v?String(v).slice(0,5):'',
 month:v=>{const[y,m]=String(v).split('-');return new Date(+y,+m-1,1).toLocaleDateString(undefined,{month:'short',year:'2-digit'})},
};
export const dayWhen=d=>`${fmt.date(d.day_date)}${d.start_time?` · ${fmt.time(d.start_time)}${d.end_time?'–'+fmt.time(d.end_time):''}`:''}`;
export const STATUS={pending:['Pending','wait'],approved:['Approved','good'],rejected:['Rejected','alert'],planned:['Planned','neutral'],announced:['Announced','info'],open:['Open','wait'],submissions:['Submissions open','wait'],evaluating:['Evaluating','wait'],closed:['Closed','good'],
 draft:['Draft','neutral'],submitted:['Submitted','wait'],live:['Live','good'],scheduled:['Scheduled','neutral'],checked_in:['Checked in','good'],not_checked_in:['Not yet checked in','neutral'],not_submitted:['Not submitted','neutral'],graded:['Graded','good'],resubmission_requested:['Resubmission requested','alert'],
 ready:['Ready','good'],failed:['Failed','alert'],generating:['Generating','wait'],sent:['Sent','good'],sending:['Sending','wait'],cancelled:['Cancelled','neutral'],registered:['Registered','info'],active:['Active','good'],inactive:['Deactivated','alert'],read:['Read','neutral'],unread:['Unread','info'],outdated:['Outdated','neutral'],rescheduled:['Rescheduled','info']};
