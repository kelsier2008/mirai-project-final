import {runtimeConfig} from '../config/runtime-config.js';
import {h} from '../core/dom.js';
import {API} from '../core/api.js';
import {CFG} from '../core/state.js';
import {themeButton} from '../core/theme.js';
import {frm} from '../components/forms.js';
import {logo} from '../components/brand.js';

// ---------- this portal's sign-in screen ----------
export const loginStory=portal=>h('section',{class:'login-story'},logo(),h('div',{class:'story-copy'},h('span',{class:'eyebrow'},`${CFG.institution_name} · ${portal.title}`),h('h1',{},'Make every moment',h('br'),h('span',{},'count.')),h('p',{},'One home for clubs, Club Days, check-ins, submissions and the records students are proud to share.'),h('div',{class:'story-stats'},h('div',{},h('strong',{},'01'),h('small',{},'Find your people')),h('div',{},h('strong',{},'02'),h('small',{},'Show what you can do')),h('div',{},h('strong',{},'03'),h('small',{},'Keep your record')))),h('div',{class:'story-footer'},CFG.app_name));
export function loginView(portal,{message,onSignIn}={}){const A=document.getElementById('app');A.replaceChildren();document.body.className='';document.title=`${portal.title} · ${CFG.app_short_name}`;
 const f=frm([['identifier',portal.identifierLabel,'text',null,{autocomplete:'username'}],['password','Password','password',null,{autocomplete:'current-password'}]],'Continue to workspace',async d=>{await onSignIn(d.identifier.trim(),d.password)},0,{draft:false});
 const story=loginStory(portal);
 const demo=runtimeConfig.demoLogins.filter(([,role])=>role===portal.expectedRole);
 const demos=h('div',{class:'demo-buttons'},demo.map(([e,,l])=>h('button',{type:'button',class:'s',onclick:()=>{f.identifier.value=e;f.password.value=runtimeConfig.demoPassword}},l)));
 A.append(h('div',{class:'login-screen'},story,h('section',{class:'login-side'},h('div',{class:'mobile-brand'},logo()),h('div',{class:'login-card'},h('div',{class:'spotlight-head'},h('div',{class:'page-eyebrow'},'Welcome back'),themeButton()),h('h2',{},`Sign in to the ${portal.title}`),h('p',{},portal.loginIntro),message&&h('div',{class:'notice wait'},message),f,demo.length?h('div',{class:'demo-area'},h('span',{},`Demo accounts · ${runtimeConfig.demoPassword} (${runtimeConfig.environment} build only)`),demos):null,runtimeConfig.allowApiOverride&&h('details',{class:'api-setting'},h('summary',{},'Connection settings'),h('label',{},'API address',h('input',{value:API(),onchange:e=>{try{localStorage.setItem('api',e.target.value.trim())}catch{}}})))))))}
