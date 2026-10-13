import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader } from '../components/Card';
import { Async, Field, Page, fieldClass } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { downloadFile, listClubDays, listSubmissions, requestBlob, submitLink, uploadSubmission } from '../api/services';
import type { SubmissionDto } from '../api/types';
import { fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { useEffect } from 'react';

const isPdf = (s: SubmissionDto) => /\.pdf$/i.test(s.original_filename || '');
const name = (s: SubmissionDto) => s.original_filename || 'file';

function SubmissionActions({ s }: { s: SubmissionDto }) {
  const [preview, setPreview] = useState<{ url: string; image: boolean } | null>(null);
  if (s.kind === 'link') return null;
  const previewable = s.kind === 'photo' || isPdf(s);
  const close = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };
  return (
    <div className="flex gap-2">
      {previewable && <Button variant="secondary" small onClick={async () => setPreview({ url: URL.createObjectURL(await requestBlob(`/submissions/${s.id}/download?inline=true`)), image: s.kind === 'photo' })}>Preview</Button>}
      <Button variant="secondary" small onClick={() => downloadFile(`/submissions/${s.id}/download`, name(s))}>Download</Button>
      {preview && <Modal title={name(s)} wide onClose={close}>{preview.image ? <img src={preview.url} alt={name(s)} className="max-h-[70vh] w-full object-contain" /> : <iframe src={preview.url} title={name(s)} className="h-[70vh] w-full" />}</Modal>}
    </div>
  );
}

export default function Submit() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [days] = useLoad(async () => (await listClubDays()).filter((d) => ['open', 'submissions', 'evaluating', 'closed'].includes(d.status)));
  const [kind, setKind] = useState('file');
  const [url, setUrl] = useState('');
  const dayId = params.get('day') ?? (days.status === 'ready' ? String(days.data[0]?.id ?? '') : '');
  const [subs, reload] = useLoad(() => (dayId ? listSubmissions(dayId) : Promise.resolve([] as SubmissionDto[])), [dayId]);
  useEffect(() => { /* keep ?day in sync once days arrive */ if (days.status === 'ready' && !params.get('day') && days.data[0]) setParams({ day: String(days.data[0].id) }, { replace: true }); }, [days, params, setParams]);

  async function onFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) return toast('Choose a file first', true);
    try { await uploadSubmission(dayId, kind, file); toast('Uploaded'); form.reset(); reload(); } catch (err) { toast(err instanceof Error ? err.message : 'Upload failed', true); }
  }
  async function onLink(e: FormEvent) {
    e.preventDefault();
    try { await submitLink(dayId, url); toast('Submitted'); setUrl(''); reload(); } catch (err) { toast(err instanceof Error ? err.message : 'Could not submit link', true); }
  }

  return (
    <Page title="Submit" subtitle="Share a deliverable and follow its evaluation.">
      <Async state={days} retry={() => location.reload()}>
        {(list) => {
          if (list.length === 0) return <Card className="p-8 text-center text-muted">Nothing to submit yet. Submissions open once a Club Day for your club is open.</Card>;
          const d = list.find((x) => String(x.id) === dayId);
          const resub = subs.status === 'ready' ? [...subs.data].reverse().find((s) => s.evaluation?.status === 'resubmission_requested') : undefined;
          return (
            <>
              <Card className="p-[18px]">
                <CardHeader title="Club Day" />
                <div className="mt-3 max-w-[560px]">
                  <Field label="Club Day">
                    <select className={fieldClass} value={dayId} onChange={(e) => setParams({ day: e.target.value })}>
                      {list.map((x) => <option key={x.id} value={x.id}>{x.club_name} · {x.title || x.plan_topic || 'Club Day'} · {fmt.date(x.day_date)}</option>)}
                    </select>
                  </Field>
                </div>
                {d && <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-muted">{[d.plan_deliverable && `Deliverable: ${d.plan_deliverable}`, d.submission_deadline && `Due ${fmt.dt(d.submission_deadline)}`].filter(Boolean).join(' · ') || 'No deliverable details.'}<StatusPill status={d.status} /></p>}
              </Card>
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-[18px]">
                  <CardHeader title="Upload a file or photo" />
                  <p className="mt-1 text-[13px] text-muted">Accepted: PDF, PPT/PPTX, DOC/DOCX, JPG, PNG, WEBP</p>
                  <form onSubmit={onFile} className="mt-4 space-y-3">
                    <Field label="Type"><select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}><option value="file">Document (pdf, ppt, doc)</option><option value="photo">Photo</option></select></Field>
                    <Field label="File"><input name="file" type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.webp" className="block w-full text-[14px]" /></Field>
                    <Button type="submit">Upload</Button>
                  </form>
                </Card>
                <Card className="p-[18px]">
                  <CardHeader title="Submit a link" />
                  <p className="mt-1 text-[13px] text-muted">http or https only</p>
                  <form onSubmit={onLink} className="mt-4 space-y-3">
                    <Field label="Link (https://…)"><input className={fieldClass} type="url" maxLength={2000} required value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
                    <Button type="submit">Submit link</Button>
                  </form>
                </Card>
              </div>
              <Card className="p-[18px]">
                <CardHeader title="My submissions" />
                <p className="mb-2 mt-1 text-[13px] text-muted">Scores appear once the Club Day is closed.</p>
                <Async state={subs} retry={reload}>
                  {(rows) => (
                    <>
                      {resub && <p role="alert" className="mb-3 rounded-field bg-red-50 px-3 py-2 text-[14px] text-danger">Resubmission requested: {resub.evaluation?.comment || 'see your evaluator'}. Upload a new version above.</p>}
                      <DataTable rows={rows} rowKey={(s) => s.id} empty="You have not submitted anything for this Club Day" columns={[
                        { header: 'Submission', cell: (s) => s.kind === 'link' ? <a className="text-primary underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> : <span>{s.kind === 'photo' ? '🖼 ' : '📄 '}{name(s)}</span> },
                        { header: 'Submitted', cell: (s) => <>{fmt.dt(s.submitted_at)} {s.is_late && <StatusPill status="late" />}</> },
                        { header: 'Evaluation', cell: (s) => !s.evaluation ? <StatusPill status="pending" label="Awaiting review" /> : <StatusPill status={s.evaluation.status} /> },
                        { header: 'Score', cell: (s) => (s.evaluation?.total != null ? `${s.evaluation.total}/${s.evaluation.max_total}` : '—') },
                        { header: 'Feedback', cell: (s) => s.evaluation?.comment || '—' },
                        { header: '', cell: (s) => <SubmissionActions s={s} /> },
                      ]} />
                    </>
                  )}
                </Async>
              </Card>
            </>
          );
        }}
      </Async>
    </Page>
  );
}
