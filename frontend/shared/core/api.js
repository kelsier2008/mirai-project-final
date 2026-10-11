import {runtimeConfig} from '../config/runtime-config.js';
import {g,tok} from './state.js';
import {h} from './dom.js';

// Every request, upload and download goes to the one shared API. Builds set its address
// from MIRAI_API_BASE_URL; only development accepts an override from the sign-in screen.
export const API=()=>(runtimeConfig.allowApiOverride&&g('api'))||runtimeConfig.apiBaseUrl;
// The portal runtime decides what an expired session does (sign out, show a message).
let onUnauthorized=()=>{};
export const setUnauthorizedHandler=fn=>{onUnauthorized=fn};
export class ApiError extends Error{constructor(m,status,detail){super(m);this.status=status;this.detail=detail}}
export async function api(m,p,b,fd){const o={method:m,headers:{}};if(tok)o.headers.Authorization='Bearer '+tok;
 if(fd)o.body=fd;else if(b!==undefined&&b!==null){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
 let r;try{r=await fetch(API()+p,o)}catch{throw new ApiError(`Cannot reach the server at ${API()}. Check your connection and try again.`,0)}
 if(r.status===401&&tok&&p!=='/auth/login'){onUnauthorized('Your session has ended. Please sign in again.');throw new ApiError('Session expired',401)}
 if(!r.ok){const d=await r.json().catch(()=>({}));const det=d.detail;
  const msg=typeof det==='string'?det:Array.isArray(det)?det.map(x=>(x.loc&&x.loc.length>1?String(x.loc[x.loc.length-1]).replaceAll('_',' ')+': ':'')+String(x.msg).replace(/^Value error, /,'')).join('; '):det&&det.message?det.message:r.status===403?'You do not have permission to do that.':`Something went wrong (error ${r.status}).`;
  throw new ApiError(msg,r.status,det)}
 return(r.headers.get('content-type')||'').includes('json')?r.json():r}
export const dl=async(p,n)=>{const r=await fetch(API()+p,{headers:tok?{Authorization:'Bearer '+tok}:{}});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(typeof d.detail==='string'?d.detail:'Download failed')}const u=URL.createObjectURL(await r.blob()),a=h('a',{href:u,download:n});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)};
export const blobUrl=async p=>{const r=await fetch(API()+p,{headers:{Authorization:'Bearer '+tok}});if(!r.ok)throw new Error('Could not load the file');return URL.createObjectURL(await r.blob())};
