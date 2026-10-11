import {toast} from '../../core/dom.js';
import {api} from '../../core/api.js';
import {pill,btn} from '../../components/ui.js';
import {frm} from '../../components/forms.js';
import {ask} from '../../components/dialogs.js';
import {render} from '../../navigation/router.js';

// Student actions on the Events page: register, form or join a team, claim a
// participation certificate and share a photo.
export const studentEventExtensions={
 listExtra:e=>e.my_registered&&pill('registered'),
 actions({e,id,mine,box,show}){
  box.push(e.my_registered?btn('Unregister',async()=>{if(!await ask('Unregister',`Leave ${e.name}? Your team place is released.`,{confirm:'Unregister',danger:true}))return;await api('DELETE',`/events/${id}/register`);toast('Unregistered');render('Events')},'d'):btn('Register',async()=>{await api('POST',`/events/${id}/register`);toast('Registered');show(id)}));
  if(e.my_registered&&!mine)box.push(frm([['name','New team name','text',null,{minlength:2,maxlength:60}]],'Create team',async d=>{await api('POST',`/events/${id}/teams`,{name:d.name});toast('Team created');show(id)}));
  if(mine)box.push(btn('Leave '+e.my_team.name,async()=>{await api('POST',`/events/${id}/teams/leave`);toast('Left team');show(id)},'s'));
  if(e.my_registered)box.push(btn('Claim participation certificate',async()=>{const c=await api('POST',`/events/${id}/certificates/participation/claim`);toast(c.already_issued?'Certificate already exists':'Certificate requested; it will be ready shortly')},'s'))},
 teamAction:(t,{e,id,mine,show})=>e.my_registered&&!mine&&(!e.team_size||t.members.length<e.team_size)&&btn('Join',async()=>{await api('POST',`/events/${id}/teams/${t.id}/join`);toast('Joined');show(id)}),
 afterGallery({e,id,box,show}){
  if(e.my_registered)box.push(frm([['file','Choose a photo','file',null,{accept:'.jpg,.jpeg,.png,.webp'}],['?consent_to_publish','I consent to sharing this photo in the event gallery','checkbox']],'Share a photo',async d=>{const fd=new FormData();fd.append('file',d.file);fd.append('consent_to_publish',String(d.consent_to_publish==='on'));await api('POST',`/events/${id}/media`,null,fd);toast('Photo sent for review');show(id)},0));},
};
