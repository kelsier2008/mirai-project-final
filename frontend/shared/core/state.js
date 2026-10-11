// Session state shared by every portal module. Imported bindings are live, so modules
// read `me`, `tok`, `CFG` and `currentPage` directly and change them only through the
// setters below.
// Important data always comes from the API. Browser storage keeps only the sign-in
// token (tab session), the theme, form drafts and the last-opened check-in session ID.
export const g=k=>{try{return localStorage.getItem(k)}catch{return null}};
export let tok=null,me=null,currentPage='';
export let CFG={app_name:'Mirai Club Activities Tracker',app_short_name:'Mirai Clubs',institution_name:'Mirai',role_labels:{student:'Student',coordinator:'Club coordinator',advisor:'Faculty advisor',campus_admin:'Campus manager',super_admin:'Super admin'}};
let draftSeq=0,liveTimer;
export function setSession(token,user){tok=token;me=user}
export function setConfig(c){CFG={...CFG,...c}}
export function setCurrentPage(t){currentPage=t;draftSeq=0}
export const nextDraftSeq=()=>draftSeq++;
// One live check-in poller at a time; navigation and sign-out stop it.
export function setLiveTimer(id){clearInterval(liveTimer);liveTimer=id}
export function clearLiveTimer(){clearInterval(liveTimer);liveTimer=undefined}
export const roleLabel=r=>CFG.role_labels?.[r]||String(r).replaceAll('_',' ');
export const can=p=>!!me?.permissions?.includes(p);
