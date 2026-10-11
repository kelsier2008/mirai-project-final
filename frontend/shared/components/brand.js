import {h} from '../core/dom.js';
import {CFG} from '../core/state.js';

export const logo=()=>h('div',{class:'brand'},h('div',{class:'brand-mark'},'✦'),h('div',{class:'brand-copy'},h('strong',{},CFG.app_short_name),h('span',{},CFG.institution_name+' · Club activities')));
