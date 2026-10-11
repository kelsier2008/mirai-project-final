import {h,toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {can} from '../../core/state.js';
import {fmt,STATUS} from '../../core/format.js';
import {pill,card,half,heading,empty,btn,tbl,clean,whenCell} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {ask} from '../../components/dialogs.js';
import {render} from '../../navigation/router.js';
import {NEXT,NEXT_LABEL,planPill,planDialog,reviewPlan,rescheduleDialog,presenterDialog} from './day-workflow.js';
import {importCard} from './calendar-import.js';
import {showQuickDay} from './quick-day.js';

// ---------- Club Day planner (staff) ----------
export const plannerPage=async b=>{const ds=await api('GET','/club-days'),mgr=can('club_day.create');showQuickDay(b,ds);
 if(mgr){const cl=(await api('GET','/clubs')).filter(c=>c.approval_status==='approved'&&c.is_active);
  b.append(half(heading('Plan ahead','New Club Day'),cl.length?frm([['club_id','Club','select',cl.map(c=>[c.id,c.name])],['day_date','Date','date'],['?title','Title','text',null,{maxlength:160}],['?start_time','Start time','time'],['?end_time','End time','time'],['?submission_deadline','Submission deadline','datetime-local',null,{hint:'Must be on or after the Club Day.'}]],'Create Club Day',async d=>{clean(d);if(d.end_time&&!d.start_time)throw new Error('Give a start time when you give an end time');if(d.start_time&&d.end_time&&d.end_time<=d.start_time)throw new Error('End time must be later than start time');if(d.submission_deadline){const dl=new Date(d.submission_deadline);if(d.submission_deadline.slice(0,10)<d.day_date)throw new Error('The submission deadline cannot be before the Club Day');d.submission_deadline=dl.toISOString()}d.club_id=+d.club_id;await api('POST','/club-days',d);toast('Club Day created. Next: fill in its details.');render('Days')}):empty('No active approved clubs','Club Days can be scheduled once a club is approved and active.')),
   importCard(cl))}
 const adv=can('club_day.plan.decide'),reload=()=>render('Days');
 b.append(card(heading(`${ds.length} total`,'Club Days'),tbl(ds,[['Club Day',d=>[h('strong',{},d.title||d.plan_topic||'Club Day'),h('small',{class:'field-hint'},`#${d.id} · ${d.club_name}`)]],['When',d=>[whenCell(d),d.submission_deadline&&h('small',{class:'field-hint'},'Due '+fmt.dt(d.submission_deadline))]],['Plan',d=>[planPill(d),d.plan_topic&&h('small',{class:'field-hint'},[d.plan_topic,d.plan_format,d.plan_venue].filter(Boolean).join(' · '))]],['Status',d=>h('div',{class:'pill-row'},pill(d.status),d.schedule_version>1&&pill('rescheduled'))],['Actions',d=>h('div',{class:'pill-row'},
  mgr&&d.status=='planned'&&btn(d.plan_status?'Edit details':'Fill details',()=>planDialog(d,reload),d.plan_status==='pending'?'s':''),
  adv&&d.plan_status==='pending'&&btn('Review plan',()=>reviewPlan(d,reload)),
  can('club_day.reschedule')&&['planned','approved','announced'].includes(d.status)&&btn('Reschedule',()=>rescheduleDialog(d,reload),'s'),
  mgr&&['open','submissions','evaluating','closed'].includes(d.status)&&btn('Record presenter',()=>presenterDialog(d),'s'),
  mgr&&NEXT[d.status]&&btn(NEXT_LABEL[NEXT[d.status]]+' →',async()=>{if(NEXT[d.status]==='closed'&&!await ask('Close Club Day','Closing publishes scores to students and ends grading. Continue?',{confirm:'Close & publish'}))return;await api('POST',`/club-days/${d.id}/transition`,{target:NEXT[d.status]});toast(`Club Day is now ${STATUS[NEXT[d.status]][0].toLowerCase()}`);reload()},'s'))]],'No Club Days yet')))};
