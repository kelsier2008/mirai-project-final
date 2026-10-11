// ---------- DOM helpers ----------
export const h=(t,a={},...c)=>{const e=document.createElement(t);for(const k in a){const v=a[k];if(v==null||v===false)continue;if(k.startsWith('on'))e[k]=v;else if(k==='value'||k==='checked')e[k]=v;else e.setAttribute(k,v===true?'':v)}c.flat(9).forEach(x=>{if(x==null||x===false)return;e.append(x.nodeType?x:document.createTextNode(x))});return e};
export const toast=(m,bad)=>{const t=h('div',{class:'toast'+(bad?' bad':''),role:bad?'alert':'status'},m);document.body.append(t);setTimeout(()=>t.remove(),bad?6000:3600)};
export const go=async f=>{try{return await f()}catch(e){toast(e.message,1)}};
