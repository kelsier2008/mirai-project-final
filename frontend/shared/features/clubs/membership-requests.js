import {h,toast,go} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,empty,btn,tbl,picker} from '../../components/ui.js';
import {ask} from '../../components/dialogs.js';
import {hashParams,setParams} from '../../navigation/router.js';

// ---------- Membership requests (coordinators and campus managers) ----------
export const membershipRequestsPage=async b=>{const cl=await api('GET','/clubs');if(!cl.length)return b.append(card(empty('No clubs yet','You will see join requests for the clubs you manage.')));
 const s=picker(cl.map(c=>[c.id,c.name]),{'aria-label':'Club'}),box=h('div');const want=hashParams().get('club');if(want&&cl.some(c=>String(c.id)===want))s.value=want;
 const load=async()=>{setParams({club:s.value});const r=await api('GET',`/clubs/${s.value}/memberships`);box.replaceChildren(tbl(r,[['Student',m=>[h('strong',{},m.student_name),h('small',{class:'field-hint'},m.student_code)]],['Type','type'],['Requested',m=>fmt.date(m.created_at)],['Status',m=>pill(m.status)],
  ['',m=>m.status=='pending'&&h('div',{class:'pill-row'},btn('Approve',async()=>{await api('POST',`/memberships/${m.id}/decision`,{decision:'approve'});toast('Approved');load()}),btn('Reject',async()=>{const reason=await ask('Reject request',`Reject ${m.student_name}'s request?`,{confirm:'Reject',danger:true,reason:true});if(reason==null)return;await api('POST',`/memberships/${m.id}/decision`,{decision:'reject',reason:reason||null});toast('Rejected');load()},'d'))]],'No requests for this club'))};
 s.onchange=()=>go(load);b.append(card(heading('Choose a club','Join requests'),h('label',{},'Club',s),box));await load()};
