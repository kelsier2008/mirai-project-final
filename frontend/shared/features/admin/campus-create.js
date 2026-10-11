import {toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {can} from '../../core/state.js';
import {card,heading} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {render} from '../../navigation/router.js';

// Add a campus: super admins only (the API requires the campus.create permission).
export const campusCreationCard=b=>{if(can('campus.create'))b.append(card(heading('Super admin','Add campus'),frm([['name','Campus name','text',null,{minlength:2,maxlength:120}]],'Create campus',async d=>{await api('POST','/campuses',{name:d.name});toast('Campus created');render('Administration')})));};
