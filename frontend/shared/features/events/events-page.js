import {h,toast} from '../../core/dom.js';
import {api,dl} from '../../core/api.js';
import {me} from '../../core/state.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,empty,btn,tbl} from '../../components/ui.js';
import {takeQuick} from '../../navigation/router.js';

// ---------- Events: the calendar, an event's teams, results and gallery. A portal passes
// extensions for its role: students register and form teams, staff manage. Each hook gets
// ctx = {e, id, rs, mine, box, show}; `box` is the list of nodes in the detail card. ----------
export const createEventsPage=(ext={})=>async b=>{const ev=await api('GET','/events'),det=h('div'),quick=takeQuick('event');
 async function show(id){const e=await api('GET','/events/'+id),mine=e.my_team&&e.my_team.id,rs=await api('GET',`/events/${id}/results`),box=[];const ctx={e,id,rs,mine,box,show};
  box.push(h('div',{class:'live-head'},h('div',{},h('span',{class:'page-eyebrow'},e.is_inter_college?'Inter-campus event':'Campus event'),h('h2',{},e.name),h('p',{class:'mut'},`${e.type.replaceAll('_',' ')} · ${e.registered}/${e.capacity} registered${e.starts_at?' · '+fmt.dt(e.starts_at):''}`)),h('div',{class:'pill-row'},e.schedule_version>1&&pill('rescheduled'),pill(e.approved_at?'approved':e.is_inter_college?'pending':'open',e.approved_at?'Approved':e.is_inter_college?'Approval needed':'Open'))));
  await ext.actions?.(ctx);
  box.push(h('h3',{},'Teams'),tbl(e.teams,[['ID','id'],['Team','name'],['Members',t=>t.members.map(m=>m.student_name).join(', ')],['',t=>ext.teamAction?.(t,ctx)]],'No teams yet'));
  if(rs.length)box.push(h('h3',{},'Results'),tbl(rs,[['Rank','rank'],['Winner',r=>r.team_name||r.student_name],['Notes',r=>r.notes||'—']]));
  await ext.afterResults?.(ctx);
  const gallery=await api('GET',`/events/${id}/media`);
  box.push(h('h3',{},'Event gallery'),gallery.length?tbl(gallery,[['Photo','original_filename'],['Review',m=>pill(m.moderation_status)],['Consent',m=>m.consent_to_publish?'Granted':'Withheld'],['',m=>h('div',{class:'pill-row'},btn('Open photo',()=>dl(`/events/${id}/media/${m.id}`,m.original_filename),'s'),ext.galleryActions?.(m,ctx),m.uploaded_by===me.id&&m.consent_to_publish&&btn('Withdraw consent',async()=>{await api('PUT',`/events/${id}/media/${m.id}/consent`,{consent_to_publish:false});toast('Photo removed from the public gallery');show(id)},'s'))]]):empty('The gallery is waiting for its first moment','Photos appear after the uploader gives consent and a campus manager approves them.'));
  await ext.afterGallery?.(ctx);
  det.replaceChildren(card(...box));det.scrollIntoView({behavior:'smooth',block:'start'})}
 await ext.beforeList?.(b);
 b.append(card(heading(`${ev.length} on the calendar`,'Events'),tbl(ev,[['Event',e=>[h('strong',{},e.name),e.schedule_version>1&&[' ',pill('rescheduled')]]],['Type',e=>e.type.replaceAll('_',' ')],['Seats',e=>`${e.registered}/${e.capacity}`],['Starts',e=>e.starts_at?fmt.dt(e.starts_at):'To be announced'],['Access',e=>e.is_inter_college?pill(e.approved_at?'approved':'pending',e.approved_at?'Inter-campus':'Needs approval'):pill('neutral','Campus')],['',e=>h('div',{class:'pill-row'},btn('Explore',()=>show(e.id),'s'),ext.listExtra?.(e))]],'No events yet')),det);
 if(quick)await show(quick.id)};
