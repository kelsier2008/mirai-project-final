import {h,toast,go} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,empty,tbl,picker} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {hashParams,setParams,homeButton} from '../../navigation/router.js';
import {subItem,subActions} from './submission-items.js';

// ---------- Activity submissions (students) ----------
export const submitPage=async b=>{const ds=(await api('GET','/club-days')).filter(d=>['open','submissions','evaluating','closed'].includes(d.status));
 if(!ds.length)return b.append(card(empty('Nothing to submit yet','Submissions open once a Club Day for your club is open.',homeButton())));
 const pick=picker(ds.map(d=>[d.id,`${d.club_name} · ${d.title||d.plan_topic||'Club Day'} · ${fmt.date(d.day_date)}`]),{'aria-label':'Club Day'}),list=h('div'),info=h('div');const want=hashParams().get('day');if(want&&ds.some(d=>String(d.id)===want))pick.value=want;
 const load=async()=>{setParams({day:pick.value});const d=ds.find(x=>String(x.id)===pick.value);info.replaceChildren(h('p',{class:'mut'},[d.plan_deliverable&&`Deliverable: ${d.plan_deliverable}`,d.submission_deadline&&`Due ${fmt.dt(d.submission_deadline)}`].filter(Boolean).join(' · ')||'No deliverable details.'),h('div',{class:'pill-row'},pill(d.status)));
  const r=await api('GET',`/club-days/${pick.value}/submissions`);const req=r.filter(s=>s.evaluation?.status==='resubmission_requested').pop();
  list.replaceChildren(req?h('div',{class:'notice alert'},`Resubmission requested: ${req.evaluation.comment||'see your evaluator'}. Upload a new version below.`):null,tbl(r,[['Submission',subItem],['Submitted',s=>[fmt.dt(s.submitted_at),s.is_late&&[' ',pill('late','Late')]]],['Evaluation',s=>!s.evaluation?pill('pending','Awaiting review'):s.evaluation.status==='resubmission_requested'?pill('resubmission_requested'):pill('graded')],['Score',s=>s.evaluation?.total!=null?`${s.evaluation.total}/${s.evaluation.max_total}`:'—'],['Feedback',s=>s.evaluation?.comment||'—'],['',subActions]],'You have not submitted anything for this Club Day'))};
 pick.onchange=()=>go(load);
 b.append(card(heading('Choose','Club Day'),h('label',{},'Club Day',pick),info),
  card(heading('Accepted: PDF, PPT/PPTX, DOC/DOCX, JPG, PNG, WEBP','Upload a file or photo'),frm([['kind','Type','select',[['file','Document (pdf, ppt, doc)'],['photo','Photo']]],['file','File','file',null,{accept:'.pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.webp'}]],'Upload',async d=>{const fd=new FormData();fd.append('kind',d.kind);fd.append('file',d.file);await api('POST',`/club-days/${pick.value}/submissions/file`,null,fd);toast('Uploaded');load()})),
  card(heading('http or https only','Submit a link'),frm([['url','Link (https://…)','url',null,{maxlength:2000}]],'Submit link',async d=>{await api('POST',`/club-days/${pick.value}/submissions/link`,{url:d.url});toast('Submitted');load()})),
  card(heading('Scores appear once the Club Day is closed','My submissions'),list));await load()};
