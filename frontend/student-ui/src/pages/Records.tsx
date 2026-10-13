import { useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../components/Card';
import { Async, Page } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { downloadFile, getTranscript, verifyTranscript } from '../api/services';
import { fmt } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));

export default function Records() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, reload] = useLoad(getTranscript);
  const [verdict, setVerdict] = useState<string | null>(null);

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) return toast('Choose a file first', true);
    try {
      let doc: { signature?: unknown } & Row;
      try { doc = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON'); }
      const { signature, ...snapshot } = doc;
      const r = await verifyTranscript(snapshot, signature);
      setVerdict(r.valid ? 'Transcript signature is valid' : 'This file signature is not valid');
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not verify', true); }
  }

  return (
    <Page title="My Record" subtitle={`${user?.student_code ?? ''} · Built only from your recorded attendance, submissions, evaluations and events.`}>
      <Card className="p-[18px]">
        <CardHeader title="Download your record" />
        <p className="mt-1 text-[14px] text-muted">Export a signed transcript for a portfolio or placement application. Anyone with the file can verify its signature without seeing your account.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => downloadFile('/transcripts/me/download', 'verified-transcript.json')}>Download signed transcript</Button>
          <Button variant="secondary" onClick={() => downloadFile('/transcripts/me.csv', 'student-transcript.csv')}>Download CSV</Button>
        </div>
      </Card>
      <Async state={state} retry={reload} rows={4}>
        {(t) => {
          const tot = t.totals ?? {};
          const stats: [string, string][] = [
            ['Club Days attended', fmt.n(tot.club_days_attended)], ['Submissions', fmt.n(tot.submissions)],
            ['Average score', tot.average_score == null ? '—' : `${tot.average_score} / ${tot.max_score}`],
            ['Presentations', fmt.n(tot.presentations)], ['Events attended', `${fmt.n(tot.events_attended)} / ${fmt.n(tot.events_registered)}`],
            ['Certificates', fmt.n(tot.certificates)],
          ];
          return (
            <Card className="p-[18px]">
              <CardHeader title="Activity" />
              <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {stats.map(([k, v]) => <div key={k} className="rounded-field bg-panel p-3"><dt className="text-[12px] text-muted">{k}</dt><dd className="text-[20px] font-semibold text-ink">{v}</dd></div>)}
              </dl>
              {t.memberships?.length ? <p className="mt-3 text-[14px] text-muted">Clubs: {t.memberships.map((m) => `${m.club_name} (${m.type})`).join(', ')}</p> : null}
              <h3 className="mb-1 mt-6 text-[16px] font-semibold text-ink">Club Days</h3>
              <DataTable<Row> rows={t.club_days} rowKey={(r, ) => String(r.club_day_id ?? r.id ?? JSON.stringify(r))} empty="No Club Day activity recorded yet" columns={[
                { header: 'Activity', cell: (r) => <><strong>{s(r.title || r.topic || 'Club Day')}</strong>{r.topic && r.title ? <div className="text-[12px] text-muted">{s(r.topic)}</div> : null}</> },
                { header: 'Club', cell: (r) => s(r.club_name) },
                { header: 'Date', cell: (r) => fmt.date(r.day_date as string) },
                { header: 'Attendance', cell: (r) => (r.attendance_count ? <StatusPill status="checked_in" label={r.checked_in_late ? 'Attended (late)' : 'Attended'} /> : <StatusPill status="neutral" label="Not checked in" />) },
                { header: 'Submission', cell: (r) => <StatusPill status={String(r.grading_status ?? 'not_submitted')} /> },
                { header: 'Score', cell: (r) => (r.score != null ? `${r.score} / ${tot.max_score}` : r.club_day_status === 'closed' ? '—' : 'Published at close') },
                { header: 'Presented', cell: (r) => s(r.presentation_title) },
                { header: 'Certificate', cell: (r) => (r.certificate_status ? <StatusPill status={String(r.certificate_status)} /> : '—') },
              ]} />
              <h3 className="mb-1 mt-6 text-[16px] font-semibold text-ink">Events</h3>
              <DataTable<Row> rows={t.events} rowKey={(r) => String(r.event_id ?? r.id ?? JSON.stringify(r))} empty="No events yet" columns={[
                { header: 'Event', cell: (r) => <><strong>{s(r.name)}</strong><div className="text-[12px] text-muted">{s(r.type).replaceAll('_', ' ')} · {s(r.host_campus)}</div></> },
                { header: 'Date', cell: (r) => (r.starts_at ? fmt.date(r.starts_at as string) : '—') },
                { header: 'Attendance', cell: (r) => <StatusPill status={r.checked_in_at ? 'checked_in' : 'registered'} /> },
                { header: 'Team', cell: (r) => s(r.team_name) },
                { header: 'Rank', cell: (r) => s(r.rank) },
                { header: 'Certificate', cell: (r) => (r.certificate_status ? <StatusPill status={String(r.certificate_status)} /> : '—') },
                { header: 'Duty Leave', cell: (r) => (r.duty_leave_status ? <StatusPill status={String(r.duty_leave_status)} /> : '—') },
              ]} />
            </Card>
          );
        }}
      </Async>
      <Card className="p-[18px]">
        <CardHeader title="Verify a transcript file" />
        <form onSubmit={verify} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-[13px] font-medium text-ink">Choose a signed transcript JSON<input name="file" type="file" accept=".json,application/json" className="mt-1 block text-[14px]" /></label>
          <Button type="submit" variant="secondary">Verify signature</Button>
        </form>
        {verdict && <p role="status" className="mt-3 text-[14px] font-medium text-ink">{verdict}</p>}
      </Card>
    </Page>
  );
}
