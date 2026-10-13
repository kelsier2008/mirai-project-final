import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader } from '../components/Card';
import { Async, Page } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { Tabs } from '../components/Tabs';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { listClubs, listMemberships, joinClub } from '../api/services';
import type { MembershipType } from '../api/types';
import { fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { EventsPanel } from './Events';

const active = (s: string) => ['pending', 'approved'].includes(s);

function Clubs() {
  const toast = useToast();
  const [state, reload] = useLoad(async () => {
    const [clubs, mm] = await Promise.all([listClubs(), listMemberships()]);
    return { clubs, mm };
  });
  return (
    <Async state={state} retry={reload}>
      {({ clubs, mm }) => {
        const has = (t: MembershipType) => mm.some((m) => m.type === t && active(m.status));
        const join = async (id: number, t: MembershipType) => { await joinClub(id, t); toast('Request sent'); reload(); };
        return (
          <>
            <Card className="p-[18px]">
              <CardHeader title="Clubs on your campus" />
              <p className="mb-2 mt-1 text-[13px] text-muted">1 primary + 1 secondary club</p>
              <DataTable rows={clubs} rowKey={(c) => c.id} empty="No clubs yet" columns={[
                { header: 'Club', cell: (c) => <><strong>{c.name}</strong>{c.description && <div className="text-[12px] text-muted">{c.description}</div>}</> },
                { header: 'Advisor', cell: (c) => c.advisor_name || '—' },
                { header: 'Seats', cell: (c) => `${c.approved_count}/${c.capacity}` },
                { header: 'Join', cell: (c) => {
                    const mine = mm.find((m) => m.club_id === c.id && active(m.status));
                    if (mine) return <StatusPill status={mine.status} label={mine.status === 'approved' ? `Member (${mine.type})` : 'Request pending'} />;
                    if (c.approved_count >= c.capacity) return <StatusPill status="closed" label="Full" />;
                    return <div className="flex gap-2">{(['primary', 'secondary'] as const).filter((t) => !has(t)).map((t) => <Button key={t} variant="secondary" small onClick={() => join(c.id, t)}>Join as {t}</Button>)}</div>;
                  } },
              ]} />
            </Card>
            <Card className="p-[18px]">
              <CardHeader title="My memberships" />
              <DataTable rows={mm} rowKey={(m) => m.id} empty="No requests yet" columns={[
                { header: 'Club', cell: (m) => m.club_name },
                { header: 'Type', cell: (m) => m.type },
                { header: 'Requested', cell: (m) => fmt.date(m.created_at) },
                { header: 'Status', cell: (m) => <StatusPill status={m.status} /> },
              ]} />
            </Card>
          </>
        );
      }}
    </Async>
  );
}

export default function Community() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'clubs' | 'events'>(params.get('tab') === 'events' ? 'events' : 'clubs');
  const change = (t: 'clubs' | 'events') => { setTab(t); setParams({ tab: t }, { replace: true }); };
  return (
    <Page title="Community" subtitle="Find a club and request to join, or explore campus events." actions={<Tabs value={tab} onChange={change} tabs={[{ id: 'clubs', label: 'Clubs' }, { id: 'events', label: 'Events' }]} />}>
      {tab === 'clubs' ? <Clubs /> : <EventsPanel />}
    </Page>
  );
}
