import {h} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {can} from '../../core/state.js';
import {fmt,dayWhen} from '../../core/format.js';
import {pill,card,heading,empty,btn} from '../../components/ui.js';
import {sessionTag} from '../../components/clipboard.js';
import {nav,render} from '../../navigation/router.js';
import {planPill,planDialog,reviewPlan} from '../club-days/day-workflow.js';

// ---------- Staff home (coordinators and advisors) ----------
export async function staffHome(b){
 const[all,live]=await Promise.all([api('GET','/club-days'),api('GET','/checkin/sessions?status=live&limit=10')]);
 const upcoming=all.filter(d=>d.status!=='closed'&&d.day_date>=new Date().toISOString().slice(0,10)).sort((a,c)=>a.day_date<c.day_date?-1:1);
 const review=can('club_day.plan.decide')?all.filter(d=>d.plan_status==='pending'):[],fill=can('club_day.plan.edit')?all.filter(d=>d.status==='planned'&&d.plan_status!=='pending'):[];
 const todo=[...review.map(d=>h('div',{class:'list-item'},h('div',{},h('strong',{},`Review plan · ${d.title||d.plan_topic||'Club Day'}`),h('small',{},`${d.club_name} · ${dayWhen(d)} · submitted ${fmt.dt(d.plan_submitted_at)}`)),btn('Review plan',()=>reviewPlan(d,()=>render('Home'))))),
  ...fill.map(d=>h('div',{class:'list-item'},h('div',{},h('strong',{},`${d.plan_status==='rejected'?'Update':'Complete'} plan · ${d.title||'Club Day'}`),h('small',{},`${d.club_name} · ${dayWhen(d)}`)),h('div',{class:'pill-row'},planPill(d),btn('Fill details',()=>planDialog(d,()=>render('Home'))))))];
 b.append(card(heading(`${todo.length} item${todo.length===1?'':'s'}`,'Needs your attention'),todo.length?h('div',{class:'list'},todo):empty('All caught up','No plans are waiting on you.')),
  card(heading(`${live.items.length} live`,'Check-in sessions',btn('Open check-in',()=>nav('Check-in'),'s')),live.items.length?h('div',{class:'list'},live.items.map(s=>h('div',{class:'list-item'},h('div',{},h('strong',{},`${s.club_name} · ${s.club_day_title||'Club Day'}`),h('small',{},`Closes ${fmt.clock(s.closes_at)} · ${s.checked_in}/${s.eligible_members} checked in`)),h('div',{class:'pill-row'},sessionTag(s.id),btn('Show',()=>nav('Check-in',{session:s.id}),'s'))))):empty('No live check-in','Open a window from the Check-in page when a Club Day is open.')),
  card(heading(`${upcoming.length} scheduled`,'Upcoming Club Days',btn('Open planner',()=>nav('Days'),'s')),upcoming.length?h('div',{class:'list'},upcoming.slice(0,8).map(d=>h('div',{class:'list-item'},h('div',{},h('strong',{},d.title||d.plan_topic||'Club Day'),h('small',{},`${d.club_name} · ${dayWhen(d)}`)),h('div',{class:'pill-row'},d.schedule_version>1&&pill('rescheduled'),planPill(d),pill(d.status))))):empty('Nothing scheduled','Create a Club Day from the planner.')))}
