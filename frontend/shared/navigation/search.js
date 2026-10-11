import {h} from '../core/dom.js';
import {api} from '../core/api.js';
import {fmt,STATUS} from '../core/format.js';
import {nav,hasPage} from './router.js';

// ---------- global search ----------
let searchTimer;
const distance=(a,b)=>{const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}return row[b.length]};
const searchScore=(q,text)=>{q=q.toLowerCase().trim();text=String(text||'').toLowerCase();if(!q)return 0;if(text.includes(q))return 100-q.length*.05;const best=Math.min(...text.split(/\W+/).filter(Boolean).map(w=>distance(q,w)));return best<=Math.max(1,Math.floor(q.length/3))?72-best*8:0};
export function initGlobalSearch(input,panel){let seq=0;const close=()=>{panel.hidden=true;input.setAttribute('aria-expanded','false')};
 const run=async()=>{const q=input.value.trim(),stamp=++seq;if(q.length<2){close();return}panel.hidden=false;input.setAttribute('aria-expanded','true');panel.replaceChildren(h('div',{class:'search-loading'},h('span',{class:'button-spinner'}),'Searching…'));
  const sources=[['Clubs',hasPage('Clubs')?'Clubs':'Days','/clubs',r=>r.map(x=>({type:'club',id:x.id,title:x.name,sub:`${x.approved_count||0} members · ${x.capacity} seats`}))],['Club Days','Days','/club-days',r=>r.map(x=>({type:'day',id:x.id,title:x.title||'Club Day',sub:`${x.club_name} · ${fmt.date(x.day_date)} · ${STATUS[x.status]?.[0]||x.status}`}))],['Events','Events','/events',r=>r.map(x=>({type:'event',id:x.id,title:x.name,sub:`${x.type.replaceAll('_',' ')} · ${x.registered}/${x.capacity} registered`}))]];
  const responses=await Promise.allSettled(sources.map(s=>api('GET',s[2])));if(stamp!==seq)return;let items=[];
  responses.forEach((r,i)=>{if(r.status==='fulfilled')items.push(...sources[i][3](r.value).map(x=>({...x,page:sources[i][1],score:searchScore(q,x.title+' '+x.sub)})))});
  items=items.filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,7);
  panel.replaceChildren(...(items.length?items.map(x=>h('button',{type:'button',class:'search-result',onclick:()=>{sessionStorage.setItem('quickItem',JSON.stringify(x));input.value='';close();nav(x.page)}},h('span',{class:'search-result-icon'},x.type==='event'?'✦':x.type==='club'?'✿':'▦'),h('span',{},h('strong',{},x.title),h('small',{},x.sub)),h('kbd',{},x.page))):[h('div',{class:'empty-state search-empty'},h('span',{class:'empty-mark'},'⌕'),h('strong',{},'No close matches'),h('span',{},'Try a club, activity or event name'))]))};
 input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>run().catch(e=>{panel.replaceChildren(h('div',{class:'search-loading'},e.message));panel.hidden=false}),280)});
 input.addEventListener('focus',()=>{if(input.value.trim().length>=2)run()});input.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Enter'){const first=panel.querySelector('.search-result');if(first){e.preventDefault();first.click()}}});
 document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==input)close()});document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus()}})}
