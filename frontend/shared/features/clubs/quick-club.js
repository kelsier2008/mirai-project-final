import {h} from '../../core/dom.js';
import {pill,card,heading} from '../../components/ui.js';
import {takeQuick} from '../../navigation/router.js';

// A club picked in the global search is shown first on the Clubs page.
export const showQuickClub=(b,cl)=>{const quick=takeQuick('club');
 if(quick){const hit=cl.find(x=>x.id===quick.id);if(hit)b.append(card(heading('Quick result',hit.name),h('p',{class:'mut'},hit.description||'No description yet.'),pill('approved',`${hit.approved_count||0} / ${hit.capacity} members`)))}};
