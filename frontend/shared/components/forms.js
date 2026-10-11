import {h,toast} from '../core/dom.js';
import {me,tok,currentPage,nextDraftSeq} from '../core/state.js';

// fields: [name,label,type,options,attrs]; a name starting with ? is optional
export const frm=(fs,lab,fn,reset=1,opts={})=>{const useDraft=opts.draft!==false&&me&&tok,draftKey=useDraft?`mirai-draft:${me.id}:${currentPage}:${lab}:${nextDraftSeq()}`:'';
 const fields=fs.map(([n,l,t,o,allAttrs={}])=>{const{hint,...attrs}=allAttrs,opt=n[0]=='?',nm=opt?n.slice(1):n,rq=opt?{}:{required:true};
  const el=t=='select'?h('select',{name:nm,...rq,...attrs},o.map(x=>h('option',{value:x[0]},x[1]))):t=='area'?h('textarea',{name:nm,rows:3,...rq,...attrs}):t=='checkbox'?h('span',{class:'check-field'},h('input',{name:nm,type:'checkbox',...attrs}),h('span',{},l)):h('input',{name:nm,type:t||'text',...rq,...attrs});
  if(draftKey&&!['file','password'].includes(t)){try{const saved=JSON.parse(localStorage.getItem(draftKey)||'{}');if(saved[nm]!=null){if(t==='checkbox')el.querySelector('input').checked=!!saved[nm];else el.value=saved[nm]}}catch{}}
  return t==='checkbox'?el:h('label',{},l,el,hint&&h('small',{class:'field-hint'},hint))});
 const err=h('p',{class:'form-error',role:'alert',hidden:true});
 const f=h('form',{class:'smart-form',onsubmit:async ev=>{ev.preventDefault();if(f.classList.contains('form-busy'))return;err.hidden=true;f.classList.add('form-busy');const submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;let success=false;
  try{await fn(Object.fromEntries(new FormData(f)),f);success=true}catch(e){err.textContent=e.message||'Something went wrong';err.hidden=false;toast(e.message||'Something went wrong',1)}
  finally{f.classList.remove('form-busy');if(submit?.isConnected)submit.disabled=false}
  if(success){if(draftKey)try{localStorage.removeItem(draftKey)}catch{}if(reset)f.reset()}}},...fields,err,h('button',{type:'submit'},lab));
 if(opts.init)for(const[k,v]of Object.entries(opts.init)){const el=f.elements[k];if(el&&v!=null)el.type==='checkbox'?el.checked=!!v:el.value=v}
 if(draftKey){const save=()=>{const data={};for(const el of f.elements)if(el.name&&el.type!=='file'&&el.type!=='password')data[el.name]=el.type==='checkbox'?el.checked:el.value;try{localStorage.setItem(draftKey,JSON.stringify(data))}catch{}};f.addEventListener('input',save);f.addEventListener('change',save)}
 return f};
