import {h,toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {fmt} from '../../core/format.js';
import {pill,card,heading,btn,tbl} from '../../components/ui.js';
import {render} from '../../navigation/router.js';
import {showQuickClub} from './quick-club.js';

// ---------- Clubs: discover clubs and request to join (students) ----------
export const studentClubsPage=async b=>{const cl=await api('GET','/clubs');showQuickClub(b,cl);
 const mm=await api('GET','/memberships/me');const has=t=>mm.some(m=>m.type===t&&['pending','approved'].includes(m.status));
  const j=(c,ty)=>!has(ty)&&!mm.some(m=>m.club_id===c.id&&['pending','approved'].includes(m.status))&&btn(`Join as ${ty}`,async()=>{await api('POST',`/clubs/${c.id}/join`,{type:ty});toast('Request sent');render('Clubs')},'s');
  b.append(card(heading('1 primary + 1 secondary club','Clubs on your campus'),tbl(cl,[['Club',c=>[h('strong',{},c.name),c.description&&h('small',{class:'field-hint'},c.description)]],['Advisor',c=>c.advisor_name||'—'],['Seats',c=>`${c.approved_count}/${c.capacity}`],['Join',c=>{const mine=mm.find(m=>m.club_id===c.id&&['pending','approved'].includes(m.status));return mine?pill(mine.status,mine.status==='approved'?`Member (${mine.type})`:'Request pending'):c.approved_count>=c.capacity?pill('closed','Full'):[j(c,'primary'),j(c,'secondary')]}]])),
   card(heading('Your requests','My memberships'),tbl(mm,[['Club','club_name'],['Type','type'],['Requested',m=>fmt.date(m.created_at)],['Status',m=>pill(m.status)]])))};
