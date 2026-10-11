import {h} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {STUDENT_CODE_RE,STUDENT_CODE_HINT} from '../../core/validation.js';
import {card,heading} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {hashParams,setParams} from '../../navigation/router.js';
import {transcriptView} from './transcript-view.js';

// ---------- Student transcript lookup (campus managers and super admins) ----------
export const transcriptLookupPage=async b=>{
 const results=h('div');
 b.append(card(heading('Campus scoped access','Student transcript lookup'),frm([['ref','Student ID or account ID','text',null,{pattern:STUDENT_CODE_RE,maxlength:40,autocomplete:'off',placeholder:'e.g. S001 or 2024-CS-17',hint:STUDENT_CODE_HINT}]],'Load transcript',async d=>{const ref=d.ref.trim();if(!new RegExp(STUDENT_CODE_RE).test(ref))throw new Error(STUDENT_CODE_HINT);const r=await api('GET',`/transcripts/${encodeURIComponent(ref)}`);setParams({student:ref});results.replaceChildren(h('h3',{},r.student.name),h('p',{class:'mut'},`${r.student.student_code||'No student ID'} · ${r.student.campus||''}`),...transcriptView(r))},0,{draft:false}),results));
 const want=hashParams().get('student');if(want){const f=b.querySelector('form');f.elements.ref.value=want;f.requestSubmit()}};
