import {h} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,btn,tbl,whenCell} from '../../components/ui.js';
import {nav} from '../../navigation/router.js';
import {showQuickDay} from './quick-day.js';

// ---------- Club Days announced for the student's clubs ----------
export const studentDaysPage=async b=>{const ds=await api('GET','/club-days');showQuickDay(b,ds);
 b.append(card(heading(`${ds.length} visible`,'Your Club Days'),tbl(ds,[['Club Day',d=>[h('strong',{},d.title||d.plan_topic||'Club Day'),h('small',{class:'field-hint'},d.club_name)]],['When',d=>[whenCell(d),d.schedule_version>1&&[' ',pill('rescheduled')]]],['Plan',d=>[d.plan_topic,d.plan_format,d.plan_venue].filter(Boolean).join(' · ')||'—'],['Deliverable',d=>d.plan_deliverable||'—'],['Deadline',d=>d.submission_deadline?fmt.dt(d.submission_deadline):'—'],['Status',d=>pill(d.status)],['',d=>d.status==='open'?btn('Check in',()=>nav('Check-in'),'s'):['open','submissions'].includes(d.status)?btn('Submit work',()=>nav('Submit',{day:d.id}),'s'):null]],'No announced Club Days for your clubs yet')))};
