import {h,toast,go} from '../../core/dom.js';
import {api,dl} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {half,heading,btn,tbl} from '../../components/ui.js';
import {render} from '../../navigation/router.js';

// ---------- Academic calendar CSV import (staff) ----------
export function importCard(clubs){const report=h('div'),file=h('input',{type:'file',accept:'.csv,text/csv',required:true,'aria-label':'Calendar CSV file'}),checks=h('div',{class:'checks'},clubs.map(c=>h('label',{},h('input',{type:'checkbox',value:c.id}),c.name)));
 let checked=null;const importBtn=h('button',{type:'button',disabled:true},'Import');
 const send=async dry=>{const ids=[...checks.querySelectorAll('input:checked')].map(x=>x.value);if(!ids.length)throw new Error('Select at least one club');if(!file.files[0])throw new Error('Choose a CSV file');
  const fd=new FormData();fd.append('club_ids',ids.join(','));fd.append('file',file.files[0]);
  try{const r=await api('POST','/club-days/import'+(dry?'?dry_run=true':''),null,fd);showReport(r,dry);return r}catch(e){if(e.detail?.report)showReport(e.detail.report,dry,e.message);throw e}};
 function showReport(r,dry,message){const ok=!r.errors?.length;checked=ok&&dry?file.files[0]:null;importBtn.disabled=!checked;
  report.replaceChildren(h('div',{class:'notice '+(ok?'good':'alert')},message||(dry?(ok?`File looks good: ${r.valid_rows} valid row${r.valid_rows===1?'':'s'}; ${r.would_create} Club Day${r.would_create===1?'':'s'} would be created and ${r.skipped} skipped as duplicates. Nothing has been saved yet.`:`${r.invalid_rows} row(s) need fixing before import.`):`Imported ${r.created} Club Day${r.created===1?'':'s'}; skipped ${r.skipped} duplicate${r.skipped===1?'':'s'}.`)),
   r.errors?.length?[h('h4',{},'Rows to fix'),tbl(r.errors,[['Line','line'],['Problems',e=>e.errors.join('; ')]])]:null,
   r.warnings?.length?[h('h4',{},'Warnings'),tbl(r.warnings,[['Line','line'],['Note','warning']])]:null,
   r.per_club?.length?[h('h4',{},'Per club'),tbl(r.per_club,[['Club','club_name'],[dry?'Would create':'Created','created'],['Skipped (duplicates)','skipped']])]:null,
   r.preview?.length?[h('h4',{},`Preview (first ${r.preview.length})`),tbl(r.preview,[['Line','line'],['Date',x=>fmt.date(x.day_date)],['Title',x=>x.title||'—'],['Time',x=>x.start_time?`${x.start_time}${x.end_time?'–'+x.end_time:''}`:'—'],['Deadline',x=>x.submission_deadline?fmt.dt(x.submission_deadline):'—']])]:null)}
 file.onchange=()=>{checked=null;importBtn.disabled=true;report.replaceChildren()};checks.onchange=file.onchange;
 importBtn.onclick=()=>go(async()=>{if(file.files[0]!==checked)return toast('Check the file again before importing',1);importBtn.disabled=true;try{await send(false);toast('Calendar imported');setTimeout(()=>render('Days'),1200)}finally{importBtn.disabled=!checked}});
 return half(heading('CSV','Import the academic calendar'),h('p',{class:'mut'},'Columns: ',h('code',{},'day_date'),' (required, YYYY-MM-DD), and optional ',h('code',{},'title'),', ',h('code',{},'start_time'),' / ',h('code',{},'end_time'),' (HH:MM, 24-hour), ',h('code',{},'submission_deadline'),' (ISO date-time with timezone, e.g. 2026-11-05T18:00:00+05:30). Check the file first: nothing is saved unless every row is valid, and dates already present for a club are skipped.'),
  h('label',{},'Clubs'),checks,h('label',{},'Calendar file',file),h('div',{class:'pill-row'},btn('Check file',()=>send(true),'s'),importBtn,btn('Download template',()=>dl('/club-days/import/template','club-day-calendar-template.csv'),'s')),report)}
