import {h,toast} from '../../core/dom.js';
import {api,dl} from '../../core/api.js';
import {me,can} from '../../core/state.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,btn,tbl,clean} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {modal,ask} from '../../components/dialogs.js';
import {render} from '../../navigation/router.js';

// Staff controls on the Events page. Coordinators and advisors see events read-only;
// campus managers and super admins (event.manage) create, approve and run them.
const adm=()=>can('event.manage');
export const staffEventExtensions={
 async beforeList(b){if(!adm())return;
 const campuses=me.role==='super_admin'?await api('GET','/campuses'):[];const fields=[['name','Event name','text',null,{minlength:3,maxlength:120}],['type','Type','select',[['gambade','Gambade'],['hackathon','Hackathon'],['cross_road','Cross Road'],['international_conference','International Conference'],['other','Other']]],['capacity','Capacity','number',null,{min:1}],['?team_size','Team size','number',null,{min:1,max:50}],['?starts_at','Starts at','datetime-local'],['?is_inter_college','Inter-campus event (approval required)','checkbox']];if(me.role==='super_admin')fields.push(['campus_id','Campus','select',campuses.map(c=>[c.id,c.name])]);
  b.append(card(heading('Host an experience','Create event'),frm(fields,'Create event',async d=>{clean(d);d.is_inter_college=d.is_inter_college==='on';if(d.starts_at)d.starts_at=new Date(d.starts_at).toISOString();for(const k of['capacity','team_size','campus_id'])if(d[k])d[k]=+d[k];await api('POST','/events',d);toast('Event created');render('Events')})))},
 actions({e,id,rs,box,show}){
  if(adm()&&e.is_inter_college&&!e.approved_at)box.push(btn('Approve inter-campus access',async()=>{await api('POST',`/events/${id}/approve`);toast('Students from other campuses can now discover this event');show(id)}));
  if(can('event.reschedule')&&!rs.length)box.push(btn('Reschedule',()=>eventReschedule(e,()=>show(id)),'s'));},
 async afterResults({id,box,show}){if(!adm())return;
  const rg=await api('GET',`/events/${id}/registrations`),certs=await api('GET',`/events/${id}/certificates`),sh=await api('GET',`/events/${id}/schedule-history`);
   if(sh.length)box.push(h('h3',{},'Schedule history'),h('ul',{class:'timeline'},sh.map(x=>h('li',{},`v${x.version}: ${fmt.dt(x.previous.starts_at)} → ${fmt.dt(x.current.starts_at)} · ${x.changed_by_name||''} · “${x.reason}”`))));
   box.push(h('h3',{},'Registrations and check-in'),tbl(rg,[['Student',r=>`${r.student_name} (${r.student_code})`],['Team',r=>r.team_name||'—'],['Checked in',r=>r.checked_in_at?fmt.clock(r.checked_in_at):btn('Check in',async()=>{await api('POST',`/events/${id}/checkin`,{student_id:r.student_id});show(id)})]],'No registrations yet'),
    h('h3',{},'Publish results (replaces any existing)'),
    frm([['lines','One per line: team ID,rank   e.g.  3,1','area']],'Publish results',async d=>{const results=d.lines.split('\n').map(s=>s.trim()).filter(Boolean).map((s,i)=>{const[p,q]=s.split(',').map(x=>x.trim());if(!/^\d+$/.test(p||'')||!/^\d+$/.test(q||''))throw new Error(`Line ${i+1}: use “team ID,rank” with numbers`);return{team_id:+p,rank:+q}});await api('PUT',`/events/${id}/results`,{results});toast('Results saved');show(id)},0),
    h('h3',{},'Event certificates'),btn('Issue participation to checked-in students',async()=>{const r=await api('POST',`/events/${id}/certificates/participation`);toast(`${r.issued} certificates issued`);show(id)},'s'),
    frm([['student_id','Student account ID','number',null,{min:1}],['achievement','Achievement label']],'Issue achievement',async d=>{await api('POST',`/events/${id}/certificates/achievement`,{student_id:+d.student_id,achievement:d.achievement});toast('Achievement certificate queued');show(id)}),
    tbl(certs,[['Student','student_name'],['Type','kind'],['Status',c=>pill(c.status)],['',c=>c.status==='ready'&&btn('Download PDF',()=>dl(`/certificates/${c.id}/download`,'event-certificate.pdf'),'s')]],'No certificates yet'))},
 galleryActions:(m,{id,show})=>{const adm=can('event.manage');return[adm&&m.moderation_status==='pending'&&btn('Approve',async()=>{await api('POST',`/events/${id}/media/${m.id}/moderate`,{decision:'approve'});show(id)},'s'),adm&&m.moderation_status==='pending'&&btn('Reject',async()=>{const reason=await ask('Reject photo','The photo stays out of the shared gallery.',{confirm:'Reject',danger:true,reason:true});if(reason==null)return;await api('POST',`/events/${id}/media/${m.id}/moderate`,{decision:'reject',reason:reason||'Not approved for the gallery'});show(id)},'d')]},
};
function eventReschedule(e,onDone){const local=e.starts_at?new Date(new Date(e.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 const close=modal(`Reschedule · ${e.name}`,h('div',{},h('p',{class:'mut'},`Currently ${e.starts_at?fmt.dt(e.starts_at):'not scheduled'}. Registered students and campus admins are notified once.`),frm([['starts_at','New start','datetime-local'],['reason','Reason for the change','area',null,{minlength:3,maxlength:500}]],'Reschedule event',async d=>{const when=new Date(d.starts_at);if(!(when>new Date()))throw new Error('The new start time must be in the future');const r=await api('POST',`/events/${e.id}/reschedule`,{starts_at:when.toISOString(),reason:d.reason});toast(`Event moved to ${fmt.dt(r.starts_at)} · ${r.notified} notified`);close();onDone()},0,{draft:false,init:{starts_at:local}})))}
