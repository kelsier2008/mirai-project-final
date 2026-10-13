import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../components/Card';
import { Async, Field, Page, fieldClass } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { certificateVerifyUrl, claimCertificate, downloadFile, listCertificates, listClubDays } from '../api/services';
import { fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';

export default function Certificates() {
  const toast = useToast();
  const [days] = useLoad(async () => (await listClubDays()).filter((d) => ['open', 'submissions', 'evaluating', 'closed'].includes(d.status)));
  const [certs, reload] = useLoad(listCertificates);
  const [day, setDay] = useState('');
  useEffect(() => { if (days.status === 'ready' && !day && days.data[0]) setDay(String(days.data[0].id)); }, [days, day]);

  return (
    <Page title="Certificates" subtitle="Claim and download your own participation certificates.">
      <Card className="p-[18px]">
        <CardHeader title="Claim a participation certificate" />
        <p className="mt-1 text-[13px] text-muted">Needs verified attendance.</p>
        <Async state={days} retry={() => location.reload()}>
          {(list) => list.length === 0
            ? <p className="py-6 text-center text-muted">No Club Days yet. Certificates are issued for Club Days with verified attendance.</p>
            : (
              <div className="mt-4 flex max-w-[640px] flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1"><Field label="Club Day">
                  <select className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)}>
                    {list.map((d) => <option key={d.id} value={d.id}>{d.club_name} · {d.title || 'Club Day'} · {fmt.date(d.day_date)}</option>)}
                  </select></Field></div>
                <Button onClick={async () => { await claimCertificate(+day); toast('Requested. The PDF is generated in the background.'); reload(); setTimeout(reload, 4000); }}>Claim certificate</Button>
              </div>
            )}
        </Async>
      </Card>
      <Card className="p-[18px]">
        <CardHeader title="My certificates" action={<Button variant="secondary" small onClick={async () => reload()}>Refresh</Button>} />
        <Async state={certs} retry={reload}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(c) => c.id} empty="No certificates yet" columns={[
              { header: 'Type', cell: (c) => c.kind },
              { header: 'Status', cell: (c) => <StatusPill status={c.status} label={c.revoked ? 'Revoked' : undefined} /> },
              { header: 'Activity', cell: (c) => c.title || '—' },
              { header: 'Certificate ID', cell: (c) => <span className="break-all text-[12px] text-muted">{c.id}</span> },
              { header: '', cell: (c) => (
                <div className="flex items-center gap-3">
                  {c.status === 'ready' && <Button small variant="secondary" onClick={() => downloadFile(`/certificates/${c.id}/download`, 'certificate.pdf')}>PDF</Button>}
                  <a className="text-[13px] text-primary underline" href={certificateVerifyUrl(c.id)} target="_blank" rel="noopener noreferrer">Verify</a>
                </div>) },
            ]} />
          )}
        </Async>
      </Card>
    </Page>
  );
}
