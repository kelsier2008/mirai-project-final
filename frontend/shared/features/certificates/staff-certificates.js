import {h,toast,go} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {me} from '../../core/state.js';
import {card,heading,empty,btn,tbl} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {ask} from '../../components/dialogs.js';
import {certificateDayPicker,certificateColumns} from './certificate-table.js';

// ---------- Certificates: issue, list and revoke for a Club Day (staff) ----------
export const staffCertificatesPage=async b=>{const list=h('div'),days=await api('GET','/club-days');
 if(!days.length)return b.append(card(empty('No Club Days yet','Certificates are issued for Club Days with verified attendance.')));
 const sl=certificateDayPicker(days),cols=certificateColumns();
 const load=async()=>{if(sl.value)list.replaceChildren(tbl(await api('GET',`/club-days/${sl.value}/certificates`),cols,'No certificates for this Club Day'))};sl.onchange=()=>go(load);
 b.append(card(heading('Choose','Club Day'),h('label',{},'Club Day',sl),me.role!='advisor'&&btn('Issue participation to all attendees',async()=>{const r=await api('POST',`/club-days/${sl.value}/certificates/participation`);toast(`Issued ${r.issued}; ${r.already_had} already had one`);load()})));
 if(me.role!='coordinator')b.append(card(heading('Advisor','Achievement certificate'),frm([['student_id','Student account ID','number',null,{min:1}],['achievement','Achievement (e.g. Best Project)','text',null,{maxlength:200}]],'Issue',async d=>{await api('POST','/certificates/achievement',{student_id:+d.student_id,club_day_id:+sl.value,achievement:d.achievement});toast('Issued');load()})),
  card(heading('Audit-logged','Revoke a certificate'),frm([['id','Certificate ID (full)'],['reason','Reason (min 5 characters)','text',null,{minlength:5}]],'Revoke',async d=>{if(!await ask('Revoke certificate','The public verify page will show this certificate as revoked.',{confirm:'Revoke',danger:true}))return;await api('POST',`/certificates/${d.id.trim()}/revoke`,{reason:d.reason});toast('Revoked');load()})));
 b.append(card(heading('Issued','Certificates for this Club Day',btn('Refresh',load,'s')),list));await load()};
