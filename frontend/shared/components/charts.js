import {h} from '../core/dom.js';
import {fmt} from '../core/format.js';
import {tbl,empty} from './ui.js';

// ---------- charts: single-series bars/columns, hover tooltip and a table view ----------
let tipEl;export const tip=(e,text)=>{if(!tipEl){tipEl=h('div',{class:'chart-tip',role:'tooltip'});document.body.append(tipEl)}if(!text){tipEl.hidden=true;return}tipEl.hidden=false;tipEl.textContent=text;const x=Math.min(e.clientX+14,innerWidth-tipEl.offsetWidth-8),y=Math.max(8,e.clientY-tipEl.offsetHeight-10);tipEl.style.left=x+'px';tipEl.style.top=y+'px'};
const niceMax=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),f=v/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p};
function chartBox(plot,rows,caption,unit){const table=h('div',{hidden:true},tbl(rows.map(r=>({label:r.label,value:fmt.n(r.value)})),[[caption,'label'],[unit,'value']]));
 const toggle=h('button',{type:'button',class:'s','aria-pressed':'false',onclick:()=>{table.hidden=!table.hidden;plot.hidden=!table.hidden;toggle.textContent=table.hidden?'Show as table':'Show as chart';toggle.setAttribute('aria-pressed',String(!table.hidden))}},'Show as table');
 return h('div',{class:'chart'},plot,table,h('div',{class:'chart-foot'},toggle))}
const hoverTip=(el,text)=>{el.addEventListener('mousemove',e=>tip(e,text));el.addEventListener('mouseleave',e=>tip(e))};
export function hbar(rows,{caption='Item',unit='Value',max=10}={}){rows=rows.slice(0,max);if(!rows.length||rows.every(r=>!r.value))return empty('No data yet','Figures appear once activity is recorded.');
 const peak=Math.max(...rows.map(r=>r.value));
 const plot=h('div',{class:'hbar',role:'img','aria-label':`${unit} by ${caption.toLowerCase()}: `+rows.map(r=>`${r.label} ${r.value}`).join(', ')},rows.map(r=>{const row=h('div',{class:'hbar-row'},h('span',{class:'hbar-label',title:r.label},r.label),h('span',{class:'hbar-track'},r.value>0&&h('span',{class:'hbar-bar',style:`width:${Math.max(1,r.value/peak*100)}%`}),h('span',{class:'hbar-value'},fmt.n(r.value))));hoverTip(row,`${r.label}: ${fmt.n(r.value)} ${unit.toLowerCase()}`);return row}));
 return chartBox(plot,rows,caption,unit)}
export function columns(rows,{caption='Month',unit='Value'}={}){if(!rows.length)return empty('No data yet');
 const peak=niceMax(Math.max(...rows.map(r=>r.value),1)),best=rows.reduce((a,r,i)=>r.value>rows[a].value?i:a,0);
 const plot=h('div',{class:'cols',role:'img','aria-label':`${unit} per ${caption.toLowerCase()}: `+rows.map(r=>`${r.label} ${r.value}`).join(', ')},
  h('div',{class:'cols-axis','aria-hidden':'true'},[1,.5,0].map(f=>h('span',{style:`bottom:${f*100}%`},fmt.n(peak*f)))),
  h('div',{class:'cols-plot'},[1,.5,0].map(f=>h('i',{class:'cols-grid',style:`bottom:${f*100}%`})),rows.map((r,i)=>{const col=h('div',{class:'cols-col'},h('span',{class:'cols-bar',style:`height:${r.value/peak*100}%`},(i===rows.length-1||i===best)&&r.value>0?h('b',{class:'cols-value'},fmt.n(r.value)):null));hoverTip(col,`${r.label}: ${fmt.n(r.value)} ${unit.toLowerCase()}`);return col})),
  h('div',{class:'cols-labels','aria-hidden':'true'},rows.map(r=>h('span',{},r.label))));
 return chartBox(plot,rows,caption,unit)}
