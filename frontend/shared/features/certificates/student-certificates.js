import {h,toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {card,heading,empty,btn,tbl} from '../../components/ui.js';
import {certificateDayPicker,certificateColumns} from './certificate-table.js';

// ---------- Certificates: claim and download your own (students) ----------
export const studentCertificatesPage=async b=>{const list=h('div'),days=(await api('GET','/club-days')).filter(d=>['open','submissions','evaluating','closed'].includes(d.status));
 if(!days.length)return b.append(card(empty('No Club Days yet','Certificates are issued for Club Days with verified attendance.')));
 const sl=certificateDayPicker(days),cols=certificateColumns();
 const load=async()=>list.replaceChildren(tbl(await api('GET','/certificates/me'),cols,'No certificates yet'));
  b.append(card(heading('Needs verified attendance','Claim a participation certificate'),h('label',{},'Club Day',sl),btn('Claim certificate',async()=>{await api('POST','/certificates/participation',{club_day_id:+sl.value});toast('Requested. The PDF is generated in the background.');load();setTimeout(load,4000)})),
   card(heading('Yours','My certificates',btn('Refresh',load,'s')),list));return load()};
