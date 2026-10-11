import {h,toast} from '../core/dom.js';

export async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{const ta=h('textarea',{readonly:true,style:'position:fixed;left:-9999px;opacity:0'});ta.value=text;document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch{}ta.remove();return ok}}
export const copyBtn=(value,what='session ID')=>h('button',{type:'button',class:'s copy-btn',title:`Copy ${what} ${value}`,'aria-label':`Copy ${what} ${value}`,onclick:async e=>{const b=e.currentTarget,ok=await copyText(String(value));if(ok){toast(`Copied ${what} ${value}`);b.textContent='Copied ✓';setTimeout(()=>{if(b.isConnected)b.textContent='Copy'},1600)}else toast(`Couldn't use the clipboard here. The ${what} is ${value}; select it and copy manually.`,1)}},'Copy');
export const sessionTag=id=>h('span',{class:'id-tag'},h('code',{},`#${id}`),copyBtn(id));
