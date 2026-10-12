import {h} from '../core/dom.js';
import {me,CFG,roleLabel} from '../core/state.js';
import {themeButton} from '../core/theme.js';
import {logo} from '../components/brand.js';
import {ask} from '../components/dialogs.js';
import {nav,render,pageFromHash} from '../navigation/router.js';
import {initGlobalSearch} from '../navigation/search.js';
import {navGlyph} from '../navigation/page-meta.js';
import {updateBadge} from '../features/notifications/badge.js';

// ---------- the signed-in application shell: sidebar, top bar and page area ----------
// Navigation lists only this portal's pages (portal.pages).
let badgeTimer;
export const stopBadgeTimer=()=>clearInterval(badgeTimer);
export function shell(portal,onSignOut){const A=document.getElementById('app');A.replaceChildren();clearInterval(badgeTimer);
 const staff=me.role!=='student',initial=(me.name||me.role).split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();document.body.className=staff?'role-staff':'role-student';
 const navEl=h('nav',{id:'nav',class:'side-nav','aria-label':staff?'Admin navigation':'Student navigation'},portal.pages.map(t=>h('button',{type:'button','data-page':t,title:t,onclick:()=>nav(t)},h('span',{class:'nav-icon','aria-hidden':'true'},navGlyph[t]||'•'),h('span',{},t))));
 const aside=h('aside',{class:'sidebar'},logo(),h('div',{class:'nav-label'},portal.spaceLabel),navEl,h('div',{class:'sidebar-bottom'},h('div',{class:'user-chip'},h('div',{class:'avatar'},initial),h('div',{},h('strong',{},me.name||`Member #${me.id}`),h('small',{},roleLabel(me.role)+(me.student_code?' · '+me.student_code:''))))));
 const searchInput=h('input',{id:'globalSearch',type:'search',placeholder:'Search clubs, days, events…',autocomplete:'off','aria-label':'Search clubs, club days and events','aria-expanded':'false'}),searchPanel=h('div',{id:'searchPanel',class:'search-panel',hidden:true});
 const header=h('div',{class:'topbar'},h('div',{class:'topbar-left'},h('div',{class:'topbar-kicker'},`${CFG.institution_name.toUpperCase()}  /  ${roleLabel(me.role).toUpperCase()}${me.campus_name?'  /  '+me.campus_name.toUpperCase():''}`),h('div',{class:'global-search-wrap'},h('span',{class:'search-glass'},'⌕'),searchInput,h('kbd',{class:'search-shortcut'},'⌘ K'),searchPanel)),
  h('div',{class:'topbar-right'},h('span',{class:'date-chip'},new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})),themeButton(),
   h('button',{type:'button',class:'icon-button',title:'Open notifications','aria-label':'Open notifications',onclick:()=>nav('Notifications')},'♧',h('span',{id:'unreadBadge',class:'badge-count',hidden:true},'0')),
   h('button',{type:'button',class:'signout s',onclick:async()=>{if(await ask('Sign out','Are you sure you want to sign out?',{confirm:'Sign out'}))onSignOut()}},'Sign out')));
 const main=h('main',{id:'main',class:'main-view'},h('section',{class:'page-header'},h('div',{},h('div',{class:'page-eyebrow'},portal.spaceLabel),h('h1',{id:'pageTitle'},'Welcome'),h('p',{id:'pageSubtitle'},''))),h('div',{id:'view',class:'view-page'}));
 A.append(h('div',{class:'app-shell'},aside,h('div',{class:'main-column'},header,main)));initGlobalSearch(searchInput,searchPanel);
 render(pageFromHash());updateBadge();badgeTimer=setInterval(updateBadge,45000)}
