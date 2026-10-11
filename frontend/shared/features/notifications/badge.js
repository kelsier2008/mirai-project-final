import {api} from '../../core/api.js';

export async function updateBadge(){const el=document.getElementById('unreadBadge');if(!el)return;try{const r=await api('GET','/notifications?limit=1');el.textContent=r.unread_count>9?'9+':r.unread_count;el.hidden=!r.unread_count}catch{el.hidden=true}}
