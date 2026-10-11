import {h,toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {can,setLiveTimer,clearLiveTimer} from '../../core/state.js';
import {fmt,dayWhen} from '../../core/format.js';
import {pill,card,heading,empty,btn,tbl,statGrid,clean,whenCell} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {ask} from '../../components/dialogs.js';
import {sessionTag} from '../../components/clipboard.js';
import {nav,hashParams,setParams} from '../../navigation/router.js';
import {loadQRCode} from './qrcode.js';

// ---------- Check-in: run windows, show the rotating QR and review sessions (staff) ----------
export const staffCheckinPage=async b=>{
 const box=h('div',{class:'live-box'}),hist=h('div'),runner=can('checkin.run');
 if(runner){const ds=(await api('GET','/club-days')).filter(d=>d.status==='open');
  b.append(card(heading('Start attendance','Open a check-in window'),ds.length?frm([['club_day_id','Club Day (must be open)','select',ds.map(d=>[d.id,`${d.club_name} · ${d.title||'Club Day'} · ${dayWhen(d)}`])],['?duration_minutes','Window length (minutes)','number',null,{min:1,max:240,value:30}],['?late_after_minutes','Mark late after (minutes)','number',null,{min:0,max:240,value:10}]],'Open window',async d=>{const id=d.club_day_id;delete d.club_day_id;clean(d);for(const k in d)d[k]=+d[k];const r=await api('POST',`/checkin/club-days/${id}/open`,d);toast(`Check-in window open · session #${r.id}`);await showSession(r.id);loadHist()},0,{draft:false}):empty('No Club Day is open','Move a Club Day to “Open the day” on the planner first.',btn('Go to Club Days',()=>nav('Days'),'s'))))}
 b.append(box,card(heading('All sessions you can see','Session history',btn('Refresh',()=>loadHist(),'s')),hist));
 async function loadHist(){const r=await api('GET','/checkin/sessions?limit=100');hist.replaceChildren(tbl(r.items,[['Session',x=>sessionTag(x.id)],['Club & Club Day',x=>[h('strong',{},x.club_name),h('small',{class:'field-hint'},x.club_day_title||'Club Day')]],['Date',x=>whenCell(x)],['Window',x=>h('span',{class:'nowrap'},`${fmt.clock(x.opens_at)}–${fmt.clock(x.closes_at)}`)],['Status',x=>pill(x.status)],['Checked in',x=>`${fmt.n(x.checked_in)} / ${fmt.n(x.eligible_members)}`],['Late',x=>fmt.n(x.late)],['Flags',x=>[x.geo_flagged?`${x.geo_flagged} location`:'',x.corrected?` ${x.corrected} corrected`:''].join('')||'—'],['Opened by',x=>x.opened_by_name||'—'],['',x=>btn(x.status==='live'?'Show live':'Open',()=>showSession(x.id),'s')]],'No check-in sessions yet'))}
 async function showSession(id){setParams({session:id});try{sessionStorage.setItem('liveSession',String(id))}catch{}await live(box,id,runner);box.scrollIntoView({behavior:'smooth',block:'start'})}
 await loadHist();
 // Restore after a refresh: the URL first, then the last session opened in this tab,
 // then the only live session. Every value shown is re-read from the server.
 const want=+hashParams().get('session')||+sessionStorage.getItem('liveSession')||0,liveNow=(await api('GET','/checkin/sessions?status=live&limit=20')).items;
 if(want){try{await live(box,want,runner)}catch(e){sessionStorage.removeItem('liveSession');setParams({});if(e.status!==404)throw e}}
 else if(liveNow.length===1)await showSession(liveNow[0].id);
 else if(liveNow.length>1)box.append(card(heading(`${liveNow.length} live`,'Choose a live session'),h('div',{class:'list'},liveNow.map(s=>h('div',{class:'list-item'},h('div',{},h('strong',{},`${s.club_name} · ${s.club_day_title||'Club Day'}`),h('small',{},`${s.checked_in}/${s.eligible_members} checked in · closes ${fmt.clock(s.closes_at)}`)),btn('Show',()=>showSession(s.id),'s'))))))};
async function live(box,sid,runner){clearLiveTimer();let s=await api('GET',`/checkin/sessions/${sid}`);
 const q=h('div',{class:'qr','aria-label':'Live check-in QR code'}),tk=h('div',{class:'big'}),counts=h('div'),roster=h('div'),statusEl=h('span'),head=h('div');let last='';
 const renderHead=()=>{statusEl.replaceChildren(pill(s.status));head.replaceChildren(h('div',{class:'live-head'},h('div',{},h('span',{class:'page-eyebrow'},s.status==='live'?'Live now':'Session record'),h('h3',{},`${s.club_name} · ${s.club_day_title||'Club Day'}`),h('p',{class:'mut'},`${dayWhen(s)} · window ${fmt.clock(s.opens_at)}–${fmt.clock(s.closes_at)} · late after ${fmt.clock(s.late_after)}${s.opened_by_name?' · opened by '+s.opened_by_name:''}${s.closed_by_name?' · closed by '+s.closed_by_name:''}`)),h('div',{class:'pill-row'},statusEl,sessionTag(s.id),runner&&s.status==='live'&&btn('Close window',async()=>{if(!await ask('Close check-in','Students will no longer be able to check in to this session.',{confirm:'Close window',danger:true}))return;const r=await api('POST',`/checkin/sessions/${sid}/close`);s=r.session;toast('Check-in window closed');renderHead();tick()},'d'),btn('Hide',()=>{clearLiveTimer();box.replaceChildren();setParams({});sessionStorage.removeItem('liveSession')},'s'))));
  counts.replaceChildren(statGrid([['Checked in',`${fmt.n(s.checked_in)} / ${fmt.n(s.eligible_members)}`,s.eligible_members?fmt.pct(100*s.checked_in/s.eligible_members)+' of members':''],['Late',fmt.n(s.late)],['Location flagged',fmt.n(s.geo_flagged)],['Manual corrections',fmt.n(s.corrected)]]))};
 const correction=(st,action)=>btn(action==='add'?'Mark present':'Remove',async()=>{const reason=await ask(action==='add'?'Add attendance':'Remove attendance',`${action==='add'?'Record':'Remove'} attendance for ${st.student_name} (${st.student_code}). This is audit-logged.`,{confirm:action==='add'?'Mark present':'Remove',danger:action==='remove',reason:true,reasonRequired:true,minLength:5});if(reason==null)return;await api('POST',`/checkin/sessions/${sid}/corrections`,{student_id:st.student_id,action,reason});toast('Attendance updated');tick()},action==='add'?'s':'d');
 const tick=async()=>{if(!box.isConnected||!roster.isConnected){clearLiveTimer();return}try{
  const r=await api('GET',`/checkin/sessions/${sid}/roster`);s=r.session;renderHead();
  roster.replaceChildren(tbl(r.students,[['Student',x=>[h('strong',{},x.student_name),h('small',{class:'field-hint'},x.student_code)]],['State',x=>pill(x.state)],['Time',x=>x.checked_in_at?h('span',{class:'nowrap'},fmt.clock(x.checked_in_at)):'—'],['Flags',x=>h('div',{class:'pill-row'},x.is_late&&pill('late','Late'),x.geo_flag&&pill('alert','Location'),x.corrected&&pill('neutral','Corrected'))],...(runner?[['',x=>correction(x,x.state==='checked_in'?'remove':'add')]]:[])],'This club has no approved members'));
  if(s.status==='live'&&runner){const qr=await api('GET',`/checkin/sessions/${sid}/qr`);if(qr.payload!=last){const QRCode=await loadQRCode();last=qr.payload;q.replaceChildren();new QRCode(q,{text:qr.payload,width:240,height:240})}tk.textContent=qr.token}
  else{clearLiveTimer();q.replaceChildren(h('div',{class:'empty-state'},h('strong',{},s.status==='closed'?'Window closed':'Not open yet'),h('span',{},s.status==='closed'?`Closed ${fmt.dt(s.closes_at)}`:'')));tk.textContent=''}}
  catch(e){clearLiveTimer();tk.textContent=e.status===409?'This check-in window has closed.':e.message}};
 box.replaceChildren(card(head,counts,h('div',{class:'live-grid'},runner?h('div',{},q,tk,h('p',{class:'mut'},'Students scan this or type the session ID and code. The code changes about every 25 seconds.')):null,h('div',{},h('h4',{},'Roster'),roster))));
 renderHead();await tick();if(s.status==='live')setLiveTimer(setInterval(tick,4000))}
