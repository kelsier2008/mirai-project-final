import {h} from './dom.js';

export const THEME_KEY='mirai-theme';
export const theme=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
export function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem(THEME_KEY,t)}catch{}syncThemeButtons()}
function syncThemeButtons(){document.querySelectorAll('.theme-toggle').forEach(b=>{const dark=theme()==='dark';b.textContent=dark?'☀':'☾';b.title=dark?'Switch to light mode':'Switch to dark mode';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(dark))})}
export const themeButton=()=>{const b=h('button',{type:'button',class:'icon-button theme-toggle',onclick:()=>setTheme(theme()==='dark'?'light':'dark')});setTimeout(syncThemeButtons);return b};
