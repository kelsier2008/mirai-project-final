import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../components/Card';
import { Async, Page } from '../components/Page';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { listClubDays } from '../api/services';
import { dayWhen, fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';

const linkBtn = 'inline-flex h-8 items-center rounded-field border border-line bg-white px-3 text-[13px] font-medium text-ink transition-colors hover:bg-primary-soft';

export default function Calendar() {
  const [state, retry] = useLoad(listClubDays);
  return (
    <Page title="Calendar" subtitle="Club Days announced for your clubs.">
      <Card className="p-[18px]">
        <Async state={state} retry={retry}>
          {(days) => (
            <>
              <CardHeader title={`${days.length} Club Day${days.length === 1 ? '' : 's'}`} />
              <DataTable
                rows={days}
                rowKey={(d) => d.id}
                empty="No announced Club Days for your clubs yet"
                columns={[
                  { header: 'Club Day', cell: (d) => <><strong>{d.title || d.plan_topic || 'Club Day'}</strong><div className="text-[12px] text-muted">{d.club_name}</div></> },
                  { header: 'When', cell: (d) => <>{dayWhen(d)} {d.schedule_version > 1 && <StatusPill status="rescheduled" />}</> },
                  { header: 'Plan', cell: (d) => [d.plan_topic, d.plan_format, d.plan_venue].filter(Boolean).join(' · ') || '—' },
                  { header: 'Deliverable', cell: (d) => d.plan_deliverable || '—' },
                  { header: 'Deadline', cell: (d) => (d.submission_deadline ? fmt.dt(d.submission_deadline) : '—') },
                  { header: 'Status', cell: (d) => <StatusPill status={d.status} /> },
                  { header: '', cell: (d) => d.status === 'open'
                      ? <Link className={linkBtn} to="/attendance">Check in</Link>
                      : ['open', 'submissions'].includes(d.status) ? <Link className={linkBtn} to={`/submit?day=${d.id}`}>Submit work</Link> : null },
                ]}
              />
            </>
          )}
        </Async>
      </Card>
    </Page>
  );
}
