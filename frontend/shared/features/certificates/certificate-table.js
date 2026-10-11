import {h} from '../../core/dom.js';
import {API,dl} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,btn,picker} from '../../components/ui.js';
import {copyBtn} from '../../components/clipboard.js';

// Club Day picker and certificate table shared by the student and staff pages.
export const certificateDayPicker=days=>picker(days.map(d=>[d.id,`${d.club_name} · ${d.title||'Club Day'} · ${fmt.date(d.day_date)}`]),{'aria-label':'Club Day'});
export const certificateColumns=()=>[['Type','kind'],['Status',c=>pill(c.status,c.revoked?'Revoked':null)],['Student',c=>c.student_name||'—'],['Activity',c=>c.title||'—'],['Certificate ID',c=>h('span',{class:'id-tag'},h('small',{},c.id),copyBtn(c.id,'certificate ID'))],['',c=>h('div',{class:'pill-row'},c.status=='ready'&&btn('PDF',()=>dl(`/certificates/${c.id}/download`,'certificate.pdf'),'s'),h('a',{href:`${API()}/verify/${c.id}`,target:'_blank',rel:'noopener'},'Verify'))]];
