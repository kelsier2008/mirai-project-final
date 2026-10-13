import { useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../components/Card';
import { Async, Field, fieldClass } from '../components/Page';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import {
  claimEventCertificate, createTeam, downloadFile, getEvent, getEventMedia, getEventResults, joinTeam, leaveTeam,
  listEvents, registerEvent, setPhotoConsent, unregisterEvent, uploadEventPhoto,
} from '../api/services';
import type { EventDto } from '../api/types';
import { fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';

function EventDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const toast = useToast();
  const [state, reload] = useLoad(async () => {
    const [e, results, media] = await Promise.all([getEvent(id), getEventResults(id), getEventMedia(id)]);
    return { e, results, media };
  }, [id]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [teamName, setTeamName] = useState('');
  const refresh = () => { reload(); onChanged(); };

  return (
    <Async state={state} retry={reload}>
      {({ e, results, media }) => {
        const mine = e.my_team?.id;
        const registered = !!e.my_registered;
        const photo = async (ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          const f = ev.currentTarget;
          const file = (f.elements.namedItem('file') as HTMLInputElement).files?.[0];
          if (!file) return toast('Choose a photo first', true);
          try { await uploadEventPhoto(id, file, (f.elements.namedItem('consent') as HTMLInputElement).checked); toast('Photo sent for review'); f.reset(); reload(); }
          catch (err) { toast(err instanceof Error ? err.message : 'Upload failed', true); }
        };
        return (
          <Card className="p-[18px]">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-primary">{e.is_inter_college ? 'Inter-campus event' : 'Campus event'}</p>
            <h2 className="text-[22px] font-medium text-ink">{e.name}</h2>
            <p className="text-[14px] text-muted">{e.type.replaceAll('_', ' ')} · {e.registered}/{e.capacity} registered{e.starts_at ? ' · ' + fmt.dt(e.starts_at) : ''}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {registered
                ? <Button variant="danger" onClick={() => setConfirmLeave(true)}>Unregister</Button>
                : <Button onClick={async () => { await registerEvent(id); toast('Registered'); refresh(); }}>Register</Button>}
              {registered && <Button variant="secondary" onClick={async () => { const c = await claimEventCertificate(id); toast(c.already_issued ? 'Certificate already exists' : 'Certificate requested; it will be ready shortly'); }}>Claim participation certificate</Button>}
              {mine && e.my_team && <Button variant="secondary" onClick={async () => { await leaveTeam(id); toast('Left team'); refresh(); }}>Leave {e.my_team.name}</Button>}
            </div>
            {registered && !mine && (
              <form className="mt-4 flex max-w-[420px] items-end gap-3" onSubmit={async (ev) => { ev.preventDefault(); try { await createTeam(id, teamName); toast('Team created'); setTeamName(''); refresh(); } catch (err) { toast(err instanceof Error ? err.message : 'Could not create team', true); } }}>
                <div className="flex-1"><Field label="New team name"><input className={fieldClass} minLength={2} maxLength={60} required value={teamName} onChange={(x) => setTeamName(x.target.value)} /></Field></div>
                <Button type="submit">Create team</Button>
              </form>
            )}
            <h3 className="mb-1 mt-6 text-[16px] font-semibold text-ink">Teams</h3>
            <DataTable rows={e.teams ?? []} rowKey={(t) => t.id} empty="No teams yet" columns={[
              { header: 'Team', cell: (t) => t.name },
              { header: 'Members', cell: (t) => t.members.map((m) => m.student_name).join(', ') },
              { header: '', cell: (t) => registered && !mine && (!e.team_size || t.members.length < e.team_size) ? <Button small variant="secondary" onClick={async () => { await joinTeam(id, t.id); toast('Joined'); refresh(); }}>Join</Button> : null },
            ]} />
            {results.length > 0 && (
              <>
                <h3 className="mb-1 mt-6 text-[16px] font-semibold text-ink">Results</h3>
                <DataTable rows={results} rowKey={(r) => r.rank} columns={[
                  { header: 'Rank', cell: (r) => r.rank }, { header: 'Winner', cell: (r) => r.team_name || r.student_name }, { header: 'Notes', cell: (r) => r.notes || '—' },
                ]} />
              </>
            )}
            <h3 className="mb-1 mt-6 text-[16px] font-semibold text-ink">Event gallery</h3>
            <DataTable rows={media} rowKey={(m) => m.id} empty="The gallery is waiting for its first moment. Photos appear after the uploader gives consent and a campus manager approves them." columns={[
              { header: 'Photo', cell: (m) => m.original_filename },
              { header: 'Review', cell: (m) => <StatusPill status={m.moderation_status} /> },
              { header: 'Consent', cell: (m) => (m.consent_to_publish ? 'Granted' : 'Withheld') },
              { header: '', cell: (m) => (
                <div className="flex gap-2">
                  <Button small variant="secondary" onClick={() => downloadFile(`/events/${id}/media/${m.id}`, m.original_filename)}>Open photo</Button>
                  {m.consent_to_publish && <Button small variant="secondary" onClick={async () => { await setPhotoConsent(id, m.id, false); toast('Photo removed from the public gallery'); reload(); }}>Withdraw consent</Button>}
                </div>) },
            ]} />
            {registered && (
              <form onSubmit={photo} className="mt-4 max-w-[480px] space-y-3">
                <Field label="Choose a photo"><input name="file" type="file" accept=".jpg,.jpeg,.png,.webp" className="block w-full text-[14px]" /></Field>
                <label className="flex items-center gap-2 text-[14px] text-ink"><input name="consent" type="checkbox" /> I consent to sharing this photo in the event gallery</label>
                <Button type="submit">Share a photo</Button>
              </form>
            )}
            {confirmLeave && (
              <ConfirmDialog title="Unregister?" message={`Leave ${e.name}? Your team place is released.`} confirmLabel="Unregister" onCancel={() => setConfirmLeave(false)}
                onConfirm={async () => { setConfirmLeave(false); try { await unregisterEvent(id); toast('Unregistered'); refresh(); } catch (err) { toast(err instanceof Error ? err.message : 'Could not unregister', true); } }} />
            )}
          </Card>
        );
      }}
    </Async>
  );
}

export function EventsPanel() {
  const [state, reload] = useLoad<EventDto[]>(listEvents);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Card className="p-[18px]">
        <Async state={state} retry={reload}>
          {(events) => (
            <>
              <CardHeader title={`${events.length} on the calendar`} />
              <DataTable rows={events} rowKey={(e) => e.id} empty="No events yet" columns={[
                { header: 'Event', cell: (e) => <><strong>{e.name}</strong> {e.schedule_version > 1 && <StatusPill status="rescheduled" />} {e.my_registered && <StatusPill status="registered" />}</> },
                { header: 'Type', cell: (e) => e.type.replaceAll('_', ' ') },
                { header: 'Seats', cell: (e) => `${e.registered}/${e.capacity}` },
                { header: 'Starts', cell: (e) => (e.starts_at ? fmt.dt(e.starts_at) : 'To be announced') },
                { header: 'Access', cell: (e) => (e.is_inter_college ? <StatusPill status={e.approved_at ? 'approved' : 'pending'} label={e.approved_at ? 'Inter-campus' : 'Needs approval'} /> : <StatusPill status="neutral" label="Campus" />) },
                { header: '', cell: (e) => <Button small variant="secondary" onClick={() => setOpen(e.id)}>Explore</Button> },
              ]} />
            </>
          )}
        </Async>
      </Card>
      {open !== null && <EventDetail id={open} onChanged={reload} />}
    </>
  );
}
