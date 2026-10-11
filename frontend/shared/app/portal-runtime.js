import {API,setUnauthorizedHandler} from '../core/api.js';
import {CFG,setConfig,setSession,clearLiveTimer} from '../core/state.js';
import {configureRouter,watchHash,homeOf} from '../navigation/router.js';
import {loginView} from '../auth/login-view.js';
import {roleMismatchView} from '../auth/role-mismatch-view.js';
import {storedToken,signIn,fetchSessionUser,roleMatches,clearSession} from '../auth/session.js';
import {shell,stopBadgeTimer} from './shell.js';

// Starts one role portal: `portal` is its portal-config.js, `pages` maps each page id in
// portal.pages to the function that renders it.
export function startPortal(portal,pages){
 const missing=portal.pages.filter(t=>typeof pages[t]!=='function');
 if(missing.length)throw new Error(`${portal.portalId}: no page for ${missing.join(', ')}`);
 configureRouter(portal,pages);watchHash();
 setUnauthorizedHandler(message=>signOut(portal,message));
 boot(portal)}

function showLogin(portal,message){loginView(portal,{message,onSignIn:async(identifier,password)=>{
 const r=await signIn(portal,identifier,password);
 if(!r.ok)return roleMismatchView(portal,r.user,()=>signOut(portal));
 history.replaceState(null,'','#/'+encodeURIComponent(homeOf()));shell(portal,()=>signOut(portal))}})}

function signOut(portal,message){clearSession(portal);try{sessionStorage.clear()}catch{}clearLiveTimer();stopBadgeTimer();
 history.replaceState(null,'',location.pathname+location.search);showLogin(portal,message)}

async function loadConfig(){try{const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),4000);const r=await fetch(API()+'/config/public',{signal:ctl.signal});clearTimeout(t);if(r.ok)setConfig(await r.json())}catch{}document.title=CFG.app_name}

async function boot(portal){await loadConfig();
 const token=storedToken(portal);if(!token)return showLogin(portal);
 let user;
 try{user=await fetchSessionUser(token)}
 catch(e){
  // 401: the API client has already signed out and said the session ended.
  if(e.status===401)return;
  // Network failure: keep the stored token for a later reload, but start signed out.
  if(!e.status){setSession(null,null);return showLogin(portal,e.message)}
  clearSession(portal);return showLogin(portal,e.message)}
 if(!roleMatches(portal,user)){clearSession(portal);return roleMismatchView(portal,user,()=>signOut(portal))}
 setSession(token,user);shell(portal,()=>signOut(portal))}
