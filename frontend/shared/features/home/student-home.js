import {h} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {me} from '../../core/state.js';
import {fmt,dayWhen} from '../../core/format.js';
import {pill,card,heading,empty,btn,statGrid} from '../../components/ui.js';
import {copyBtn} from '../../components/clipboard.js';
import {nav} from '../../navigation/router.js';
import {kindLabel,noticeText} from '../notifications/notice-text.js';

// ---------- Student home ----------
export async function studentHome(b){
 const[days,mm,att,inbox]=await Promise.all([api('GET','/club-days?upcoming=true'),api('GET','/memberships/me'),api('GET','/checkin/attendance/me'),api('GET','/notifications?limit=5')]);
 const clubs=mm.filter(m=>m.status==='approved');
 b.append(card(h('div',{class:'identity'},h('div',{class:'avatar'},(me.name||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()),h('dl',{},h('div',{},h('dt',{},'Name'),h('dd',{},me.name)),h('div',{},h('dt',{},'Student ID'),h('dd',{},me.student_code||'—',' ',me.student_code&&copyBtn(me.student_code,'student ID'))),h('div',{},h('dt',{},'Campus'),h('dd',{},me.campus_name||'—')),h('div',{},h('dt',{},'Clubs'),h('dd',{},clubs.length?clubs.map(m=>`${m.club_name} (${m.type})`).join(', '):'None yet'))))),
  card(heading(`${days.length} coming up`,'Upcoming Club Days',btn('All Club Days',()=>nav('Days'),'s')),days.length?h('div',{class:'list'},days.slice(0,8).map(d=>h('div',{class:'list-item'},h('div',{},h('strong',{},d.title||d.plan_topic||'Club Day'),h('small',{},`${d.club_name} · ${dayWhen(d)}${d.plan_venue?' · '+d.plan_venue:''}`),d.submission_deadline&&h('small',{},'Submission due '+fmt.dt(d.submission_deadline))),h('div',{class:'pill-row'},d.schedule_version>1&&pill('rescheduled'),pill(d.status),d.status==='open'&&btn('Check in',()=>nav('Check-in'),'s'))))):empty('Nothing scheduled yet',clubs.length?'Your clubs have not announced their next Club Day.':'Join a club to see its Club Days here.',!clubs.length&&btn('Browse clubs',()=>nav('Clubs'),'s'))),
  card(heading('Your activity','At a glance'),statGrid([['Club Days attended',fmt.n(new Set(att.map(a=>a.club_day_id)).size)],['Check-ins',fmt.n(att.length),att[0]?'Last '+fmt.dt(att[0].checked_in_at):''],['Active clubs',fmt.n(clubs.length)],['Unread updates',fmt.n(inbox.unread_count)]])),
  card(heading('Inbox','Recent updates',btn('Open inbox',()=>nav('Notifications'),'s')),inbox.items.length?h('div',{class:'list'},inbox.items.map(n=>h('div',{class:'list-item'},h('div',{},h('strong',{},kindLabel(n.kind)),h('small',{},noticeText(n))),n.cancelled_at?pill('outdated'):n.read_at?null:pill('unread')))):empty('No updates yet')))}
