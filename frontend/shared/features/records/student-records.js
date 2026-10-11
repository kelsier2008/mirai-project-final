import {h,toast} from '../../core/dom.js';
import {api,dl} from '../../core/api.js';
import {me} from '../../core/state.js';
import {card,heading,btn} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {transcriptView} from './transcript-view.js';

// ---------- Your verified activity record (students) ----------
export const studentRecordsPage=async b=>{
 const data=await api('GET','/transcripts/me'),total=(data.club_days||[]).length+(data.events||[]).length;
  b.append(h('section',{class:'record-hero'},h('div',{},h('span',{class:'page-eyebrow'},'Student-owned · verified'),h('h2',{},`Your record${me.name?`, ${me.name.split(' ')[0]}`:''}`),h('p',{},`${me.student_code||''} · Built only from your recorded attendance, submissions, evaluations and events.`)),h('div',{class:'record-total'},h('strong',{},String(total).padStart(2,'0')),h('small',{},'recorded activities'))),
   card(heading('Take it with you','Download your record'),h('p',{class:'mut'},'Export a signed transcript for a portfolio or placement application. Anyone with the file can verify its signature without seeing your account.'),h('div',{class:'pill-row'},btn('Download signed transcript',()=>dl('/transcripts/me/download','verified-transcript.json')),btn('Download CSV',()=>dl('/transcripts/me.csv','student-transcript.csv'),'s'))),
   card(heading('Details','Activity'),...transcriptView(data)),
   card(heading('Public integrity check','Verify a transcript file'),frm([['file','Choose a signed transcript JSON','file',null,{accept:'.json,application/json'}]],'Verify signature',async d=>{let doc;try{doc=JSON.parse(await d.file.text())}catch{throw new Error('That file is not valid JSON')}const{signature,...snapshot}=doc;const r=await api('POST','/api/transcripts/verify',{snapshot,signature});toast(r.valid?'Transcript signature is valid':'This file signature is not valid',!r.valid)},0)))};
