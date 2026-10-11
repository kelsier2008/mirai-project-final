import {h} from '../../core/dom.js';
import {dl,blobUrl} from '../../core/api.js';
import {btn} from '../../components/ui.js';
import {modal} from '../../components/dialogs.js';

// ---------- Submitted files and links: show, preview and download ----------
export const subItem=s=>s.kind==='link'?h('a',{href:s.url,target:'_blank',rel:'noopener noreferrer'},s.url):h('span',{},s.kind==='photo'?'🖼 ':'📄 ',s.original_filename||'file');
export async function previewSubmission(s){const isImg=s.kind==='photo',isPdf=/\.pdf$/i.test(s.original_filename||'');if(s.kind==='link'){window.open(s.url,'_blank','noopener,noreferrer');return}
 if(!isImg&&!isPdf)return dl(`/submissions/${s.id}/download`,s.original_filename||'file');
 const url=await blobUrl(`/submissions/${s.id}/download?inline=true`);modal(s.original_filename||'Submission',isImg?h('img',{class:'preview-img',src:url,alt:s.original_filename||'Submitted photo'}):h('iframe',{class:'preview-frame',src:url,title:s.original_filename||'Submitted PDF'}),{wide:true,onClose:()=>URL.revokeObjectURL(url)})}
export const subActions=s=>h('div',{class:'pill-row'},s.kind!=='link'&&btn(s.kind==='photo'||/\.pdf$/i.test(s.original_filename||'')?'Preview':'Download',()=>previewSubmission(s),'s'),s.kind!=='link'&&btn('Download',()=>dl(`/submissions/${s.id}/download`,s.original_filename||'file'),'s'));
