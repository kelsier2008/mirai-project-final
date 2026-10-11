import {h} from '../core/dom.js';
import {me,CFG,setCurrentPage,clearLiveTimer,currentPage} from '../core/state.js';
import {card,btn} from '../components/ui.js';
import {tip} from '../components/charts.js';
import {updateBadge} from '../features/notifications/badge.js';
import {pageCopy} from './page-meta.js';

// ---------- navigation: one URL per page; a portal can only open its own pages ----------
let portal={pages:[]},P={},navSeq=0;
export function configureRouter(portalConfig,pages){portal=portalConfig;P=pages}
export const hasPage=t=>portal.pages.includes(t);
export const homeOf=()=>portal.pages[0];
export const pageFromHash=()=>decodeURIComponent(location.hash.replace(/^#\/?/,'').split('?')[0]);
export const hashParams=()=>new URLSearchParams(location.hash.split('?')[1]||'');
export function setParams(params){const q=new URLSearchParams(params).toString();history.replaceState(null,'',`#/${encodeURIComponent(currentPage)}${q?'?'+q:''}`)}
export function nav(t,params){const q=params?'?'+new URLSearchParams(params):'',target='#/'+encodeURIComponent(t)+q;if(location.hash===target)render(t);else location.hash=target}
export function watchHash(){window.addEventListener('hashchange',()=>{if(me&&document.getElementById('view'))render(pageFromHash())})}
export async function render(t){if(!hasPage(t)){t=homeOf();history.replaceState(null,'','#/'+encodeURIComponent(t))}
 const seq=++navSeq;clearLiveTimer();setCurrentPage(t);tip({},null);
 document.querySelectorAll('#nav button').forEach(b=>{const on=b.dataset.page==t;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});document.querySelector('#nav button.on')?.scrollIntoView({block:'nearest',inline:'nearest'});
 const [baseTitle,baseSubtitle]=pageCopy[t]||[t,''],subtitle=portal.subtitles?.[t]??baseSubtitle,hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening',first=(me.name||'there').split(' ')[0];
 document.getElementById('pageTitle').textContent=t===homeOf()?`${greeting}, ${first}`:baseTitle;document.getElementById('pageSubtitle').textContent=subtitle;document.title=`${t} · ${CFG.app_short_name}`;
 // A fresh container per navigation: a slow response from the previous page can only
 // write into its own (detached) container, never into this page.
 const view=h('div',{id:'view',class:'view-page page-'+t.toLowerCase().replace(/[^a-z0-9]+/g,'-')});document.getElementById('view').replaceWith(view);
 const skeleton=Array.from({length:3},(_,i)=>h('div',{class:'card skeleton-card',style:`--i:${i}`,'aria-hidden':'true'},h('div',{class:'skeleton-line wide'}),h('div',{class:'skeleton-line'}),h('div',{class:'skeleton-block'})));view.append(...skeleton);
 try{await P[t](view);skeleton.forEach(x=>x.remove())}catch(e){if(seq!==navSeq)return;view.replaceChildren(card(h('div',{class:'error-state'},h('span',{class:'empty-mark'},'↻'),h('strong',{},'This section could not load'),h('p',{class:'mut'},e.message||'Check your connection and try again.'),btn('Try again',()=>render(t),'s'))))}
 if(seq===navSeq)updateBadge()}
export const homeButton=(label='Return home')=>h('button',{type:'button',class:'s',onclick:()=>nav(homeOf())},'⌂ '+label);
export const takeQuick=type=>{const q=JSON.parse(sessionStorage.getItem('quickItem')||'null');if(q?.type!==type)return null;sessionStorage.removeItem('quickItem');return q};
