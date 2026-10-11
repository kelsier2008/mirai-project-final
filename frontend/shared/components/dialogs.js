import {h} from '../core/dom.js';

// ---------- dialogs (used instead of prompt/confirm so every action has validation) ----------
export function modal(title,content,{wide=false,onClose}={}){let closed=false;const close=()=>{if(closed)return;closed=true;ov.remove();document.removeEventListener('keydown',esc);onClose&&onClose()};const esc=e=>{if(e.key==='Escape')close()};
 const box=h('div',{class:'modal'+(wide?' wide':''),role:'dialog','aria-modal':'true','aria-label':title},h('div',{class:'modal-head'},h('h3',{},title),h('button',{type:'button',class:'icon-button',title:'Close','aria-label':'Close dialog',onclick:close},'×')),h('div',{class:'modal-body'},content));
 const ov=h('div',{class:'modal-backdrop',onmousedown:e=>{if(e.target===ov)close()}},box);document.body.append(ov);document.addEventListener('keydown',esc);
 setTimeout(()=>box.querySelector('.modal-body input:not([type=hidden]),.modal-body select,.modal-body textarea')?.focus(),40);return close}
export function ask(title,message,{confirm='Confirm',danger=false,reason=false,reasonRequired=false,reasonLabel='Reason',minLength=0}={}){return new Promise(res=>{let result=null;
 const ta=reason?h('textarea',{rows:3,maxlength:500}):null,err=h('p',{class:'form-error',hidden:true});
 const ok=h('button',{type:'button',class:danger?'d':'',onclick:()=>{const v=ta?ta.value.trim():true;if(ta&&reasonRequired&&v.length<Math.max(1,minLength)){err.textContent=minLength?`Please give a reason of at least ${minLength} characters.`:'Please give a reason.';err.hidden=false;ta.focus();return}result=ta?v:true;close()}},confirm);
 const close=modal(title,[h('p',{},message),ta&&h('label',{},reasonLabel+(reasonRequired?'':' (optional)'),ta),err,h('div',{class:'modal-actions'},h('button',{type:'button',class:'s',onclick:()=>close()},'Cancel'),ok)],{onClose:()=>res(result)})})}
