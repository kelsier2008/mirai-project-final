import {api} from '../../core/api.js';
import {me} from '../../core/state.js';
import {fmt} from '../../core/format.js';
import {card,heading,tbl} from '../../components/ui.js';
import {hbar} from '../../components/charts.js';

// Participation by campus: a super admin view across every campus.
export const campusComparisonSection=async b=>{if(me.role==='super_admin'){const cp=await api('GET','/dashboards/campuses');b.append(card(heading('Campus comparison','Participation by campus'),hbar(cp.map(c=>({label:c.campus_name,value:+c.attendance_records})),{caption:'Campus',unit:'Check-ins'}),tbl(cp,[['Campus','campus_name'],['Clubs',c=>fmt.n(c.clubs)],['Members',c=>fmt.n(c.members)],['Club Days',c=>fmt.n(c.club_days)],['Check-ins',c=>fmt.n(c.attendance_records)],['Submissions',c=>fmt.n(c.submissions)],['Average score',c=>fmt.score(c.average_score)]])))}};
