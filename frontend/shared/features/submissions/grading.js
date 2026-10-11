import {h,toast,go} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {can} from '../../core/state.js';
import {fmt,STATUS} from '../../core/format.js';
import {pill,card,heading,empty,btn,tbl,statGrid,picker} from '../../components/ui.js';
import {modal} from '../../components/dialogs.js';
import {hashParams,setParams} from '../../navigation/router.js';
import {subItem,previewSubmission,subActions} from './submission-items.js';

// ---------- Review & evaluate submissions (staff) ----------
export const gradingPage=async b=>{const ds=(await api('GET','/club-days')).filter(d=>['open','submissions','evaluating','closed'].includes(d.status));
 if(!ds.length)return b.append(card(empty('Nothing to grade yet','Club Days appear here once they are open.')));
 const pick=picker(ds.map(d=>[d.id,`${d.club_name} · ${d.title||d.plan_topic||'Club Day'} · ${fmt.date(d.day_date)} · ${STATUS[d.status]?.[0]}`]),{'aria-label':'Club Day'}),filter=picker([['all','All students'],['pending','Awaiting grading'],['not_submitted','Not submitted'],['resubmission_requested','Resubmission requested'],['graded','Graded']],{'aria-label':'Filter'}),summary=h('div'),list=h('div');
 const want=hashParams().get('day');if(want&&ds.some(d=>String(d.id)===want))pick.value=want;let data;
 const draw=()=>{const rows=data.students.filter(x=>filter.value==='all'||x.status===filter.value);const grader=can('submission.grade')&&data.club_day.scoring_open;
  list.replaceChildren(tbl(rows,[['Student',x=>[h('strong',{},x.student_name),h('small',{class:'field-hint'},x.student_code)]],['Status',x=>pill(x.status)],['What they submitted',x=>x.latest?[subItem(x.latest),h('small',{class:'field-hint'},`${fmt.dt(x.latest.submitted_at)}${x.latest.is_late?' · late':''}${x.submissions.length>1?` · ${x.submissions.length} versions`:''}`)]:h('span',{class:'mut'},'—')],['Score',x=>x.latest?.evaluation?`${x.latest.evaluation.total}/${x.latest.evaluation.max_total}`:'—'],['Feedback',x=>x.latest?.evaluation?.comment||'—'],
   ['',x=>x.latest&&h('div',{class:'pill-row'},x.latest.kind!=='link'&&btn('View',()=>previewSubmission(x.latest),'s'),grader&&btn(x.latest.evaluation?'Update evaluation':'Evaluate',()=>evaluateDialog(x,data,load)))]],'No students match this filter'))};
 const load=async()=>{setParams({day:pick.value});data=await api('GET',`/club-days/${pick.value}/grading-roster`);const c=data.counts,cd=data.club_day;
  summary.replaceChildren(h('p',{class:'mut'},`${cd.club_name} · ${cd.title||'Club Day'} · ${fmt.date(cd.day_date)}${cd.submission_deadline?' · due '+fmt.dt(cd.submission_deadline):''} · `,pill(cd.status),' ',cd.scoring_open?pill('open','Scoring open'):pill('neutral',cd.status==='closed'?'Results published':'Scoring opens at “submissions”')),
   statGrid([['Awaiting grading',fmt.n(c.pending)],['Graded',fmt.n(c.graded)],['Resubmission requested',fmt.n(c.resubmission_requested)],['Not submitted',fmt.n(c.not_submitted)]]));draw()};
 pick.onchange=()=>go(load);filter.onchange=draw;
 b.append(card(heading('Submissions only. Attendance lives on the Check-in page','Choose a Club Day'),h('div',{class:'filters'},h('label',{},'Club Day',pick),h('label',{},'Show',filter)),summary),card(heading('One row per member','Student work'),list));await load()};
function evaluateDialog(x,data,onDone){const s=x.latest,e=s.evaluation||{};
 const inputs=data.rubric.map(r=>h('label',{},`${r.key.replace(/^./,c=>c.toUpperCase())} (0–${r.max_score})`,h('input',{type:'number',name:r.key,min:0,max:r.max_score,step:1,required:true,value:e.scores?.[r.key]??''})));
 const status=picker([['graded','Graded'],['resubmission_requested','Request a resubmission']],{name:'status'}),comment=h('textarea',{name:'comment',rows:3,maxlength:2000});comment.value=e.comment||'';status.value=e.status||'graded';const err=h('p',{class:'form-error',hidden:true});
 const f=h('form',{class:'smart-form',onsubmit:async ev=>{ev.preventDefault();err.hidden=true;const scores={};for(const r of data.rubric){const v=f.elements[r.key].value;if(v===''||+v<0||+v>r.max_score||!Number.isInteger(+v)){err.textContent=`Enter a whole number from 0 to ${r.max_score} for ${r.key}.`;err.hidden=false;return}scores[r.key]=+v}
  if(status.value==='resubmission_requested'&&!comment.value.trim()){err.textContent='Tell the student what to change when requesting a resubmission.';err.hidden=false;return}
  const sb=f.querySelector('[type=submit]');sb.disabled=true;try{await api('PUT',`/submissions/${s.id}/evaluation`,{scores,comment:comment.value.trim()||null,status:status.value});toast(status.value==='graded'?'Evaluation saved':'Resubmission requested; the student was notified');close();onDone()}catch(e2){err.textContent=e2.message;err.hidden=false}finally{if(sb.isConnected)sb.disabled=false}}},
  h('div',{class:'plan-grid'},inputs),h('label',{},'Decision',status),h('label',{},'Feedback for the student',comment),err,h('div',{class:'modal-actions'},h('button',{type:'button',class:'s',onclick:()=>close()},'Cancel'),h('button',{type:'submit'},'Save evaluation')));
 const close=modal(`Evaluate · ${x.student_name} (${x.student_code})`,h('div',{},h('h4',{},'Submitted work'),h('div',{class:'list'},x.submissions.slice().reverse().map((v,i)=>h('div',{class:'list-item'},h('div',{},h('strong',{},i===0?'Latest':'Earlier version'),h('small',{},subItem(v)),h('small',{},`${fmt.dt(v.submitted_at)}${v.is_late?' · late':''}${v.evaluation?` · ${STATUS[v.evaluation.status]?.[0]} ${v.evaluation.total}/${v.evaluation.max_total}`:''}`)),subActions(v)))),h('h4',{},'Rubric'),f),{wide:true})}
