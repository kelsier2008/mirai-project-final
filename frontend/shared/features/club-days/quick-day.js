import {h} from '../../core/dom.js';
import {dayWhen} from '../../core/format.js';
import {pill,card,heading} from '../../components/ui.js';
import {takeQuick} from '../../navigation/router.js';

// A Club Day picked in the global search is shown first on the Club Days page.
export const showQuickDay=(b,ds)=>{const quick=takeQuick('day');
 if(quick){const hit=ds.find(x=>x.id===quick.id);if(hit)b.append(card(heading('Quick result',hit.title||'Club Day'),h('p',{class:'mut'},`${hit.club_name} · ${dayWhen(hit)}`),pill(hit.status)))}};
