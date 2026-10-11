import {h,toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,btn,tbl} from '../../components/ui.js';
import {ask} from '../../components/dialogs.js';
import {render} from '../../navigation/router.js';

// ---------- Duty Leave decisions (campus managers and super admins) ----------
export const dutyLeavePage=async b=>{const rows=await api('GET','/duty-leave'),pending=rows.filter(x=>x.status==='pending').length;
 b.append(card(heading(`${pending} need a decision`,'Duty Leave queue'),tbl(rows,[['Student',r=>`${r.student_name} · ${r.student_code}`],['Campus','student_campus'],['Event','event_name'],['Date',r=>r.starts_at?fmt.date(r.starts_at):'—'],['Status',r=>pill(r.status)],['Decision',r=>r.decision_reason||'—'],['',r=>r.status==='pending'&&h('div',{class:'pill-row'},btn('Approve',async()=>{await api('POST',`/duty-leave/${r.id}/decision`,{decision:'approve'});toast('Duty Leave approved');render('Duty Leave')},'s'),btn('Decline',async()=>{const reason=await ask('Decline Duty Leave',`Decline ${r.student_name}'s request?`,{confirm:'Decline',danger:true,reason:true,reasonRequired:true});if(reason==null)return;await api('POST',`/duty-leave/${r.id}/decision`,{decision:'reject',reason});toast('Duty Leave declined');render('Duty Leave')},'d'))]],'No Duty Leave requests')))};
