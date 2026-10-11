import {h,toast,go} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {me,CFG} from '../../core/state.js';
import {fmt,STATUS} from '../../core/format.js';
import {pill,card,heading,btn,tbl} from '../../components/ui.js';
import {kindLabel,noticeText} from './notice-text.js';
import {updateBadge} from './badge.js';

// ---------- Notifications ----------
export const notificationsPage=async b=>{const box=h('div'),waBox=h('div'),emailBox=h('div');
 const refresh=async()=>{const r=await api('GET','/notifications?limit=100');
  box.replaceChildren(h('div',{class:'filters'},h('span',{class:'mut'},`${fmt.n(r.unread_count)} unread`),r.unread_count?btn('Mark all read',async()=>{await api('POST','/notifications/read-all',{});refresh()},'s'):null),
   tbl(r.items,[['Notice',n=>[h('strong',{},kindLabel(n.kind)),h('small',{class:'field-hint'},noticeText(n))]],['Received',n=>h('span',{class:'nowrap'},fmt.dt(n.send_at))],['Status',n=>h('div',{class:'pill-row'},n.cancelled_at?pill('outdated','Outdated (rescheduled)'):pill(n.read_at?'read':'unread'),...(n.deliveries||[]).map(d=>pill(d.status,`${d.channel==='email'?'Email':'WhatsApp'}: ${STATUS[d.status]?.[0]||d.status}`)))],['',n=>!n.read_at&&btn('Mark read',async()=>{await api('POST',`/notifications/${n.id}/read`,{});refresh()},'s')]],'Your inbox is empty'));updateBadge()};
 const renderEmail=async()=>{const p=await api('GET','/notifications/email-preference'),cb=h('input',{type:'checkbox',checked:p.enabled});
  cb.onchange=()=>go(async()=>{const r=await api('PUT','/notifications/email-preference',{enabled:cb.checked});toast(r.enabled?'Email notifications on':'Email notifications off')});
  emailBox.replaceChildren(h('label',{class:'check-field'},cb,h('span',{},`Email me reminders and decisions at ${me.email||'my account email'}`)),!p.available&&h('p',{class:'mut'},'Email delivery is not configured on this server yet; your choice is saved for when it is.'))};
 const renderWhatsApp=async()=>{const p=await api('GET','/notifications/whatsapp-preference'),form=h('form',{class:'smart-form'}),phone=h('input',{type:'tel',inputmode:'tel',autocomplete:'tel',placeholder:'+14155552671','aria-label':'WhatsApp phone number',pattern:'\\+[1-9][0-9]{7,14}'}),enabled=h('input',{type:'checkbox',checked:p.enabled}),consent=h('input',{type:'checkbox'}),save=h('button',{type:'submit'},p.enabled?'Update WhatsApp settings':'Save WhatsApp settings');
  if(p.phone_last4)phone.placeholder=`Saved number ending in ${p.phone_last4}`;
  form.append(h('label',{},'WhatsApp number (international format)',phone),h('label',{class:'check-field'},enabled,h('span',{},'Send activity reminders to this number')),h('label',{class:'check-field'},consent,h('span',{},`I agree to receive ${CFG.app_name} updates on WhatsApp. I can turn this off here at any time.`)),save);
  form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await api('PUT','/notifications/whatsapp-preference',{phone_e164:phone.value.trim()||null,enabled:enabled.checked,consent:consent.checked});toast(enabled.checked?'WhatsApp notifications enabled':'WhatsApp notifications turned off');await renderWhatsApp()}catch(err){toast(err.message||'Could not update WhatsApp settings',1)}finally{if(save.isConnected)save.disabled=false}});
  waBox.replaceChildren(h('p',{class:'mut'},p.enabled?'Enabled'+(p.phone_last4?` · number ending ${p.phone_last4}`:''):'Optional. Your number stays private and is never shown in the inbox.'),form)};
 b.append(card(heading('Saved on the server','Notifications',btn('Refresh',refresh,'s')),box),card(heading('Optional','Email'),emailBox),card(heading('Optional','WhatsApp reminders'),h('p',{class:'mut'},'Approved activity and deadline reminder templates from your institution. Every message also stays in this inbox.'),waBox));
 await Promise.all([refresh(),renderEmail(),renderWhatsApp()])};
