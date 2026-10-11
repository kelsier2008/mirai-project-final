import {runtimeConfig} from '../config/runtime-config.js';
import {portalForRole} from '../config/portals.js';
import {h} from '../core/dom.js';
import {CFG,roleLabel} from '../core/state.js';
import {themeButton} from '../core/theme.js';
import {logo} from '../components/brand.js';
import {loginStory} from './login-view.js';

// Shown when someone signs in to a portal that does not serve their role, for example a
// student on the Super Admin Portal. Nothing from this portal is loaded for them; the
// only ways forward are their own portal (when its address is known) or signing out.
export function roleMismatchView(portal,user,onSignOut){const A=document.getElementById('app');A.replaceChildren();document.body.className='';document.title=`${portal.title} · ${CFG.app_short_name}`;
 const home=portalForRole(user.role),url=home&&runtimeConfig.portalUrls?.[home.id];
 A.append(h('div',{class:'login-screen'},loginStory(portal),h('section',{class:'login-side'},h('div',{class:'mobile-brand'},logo()),h('div',{class:'login-card',role:'alert'},h('div',{class:'spotlight-head'},h('div',{class:'page-eyebrow'},'Wrong portal'),themeButton()),
  h('h2',{},`This is the ${portal.title}`),
  h('p',{},`You signed in as ${user.name||user.email||'this account'} (${roleLabel(user.role)}). The ${portal.title} is only for ${roleLabel(portal.expectedRole).toLowerCase()} accounts, so nothing here was opened.`),
  h('div',{class:'notice alert'},home?`Use the ${home.title} for your account.`:'Your account does not have a portal yet. Ask your campus manager.'),
  h('div',{class:'modal-actions'},url?h('a',{class:'button-link',href:url},`Open the ${home.title}`):null,h('button',{type:'button',class:url?'s':'',onclick:()=>onSignOut()},'Sign out'))))))}
