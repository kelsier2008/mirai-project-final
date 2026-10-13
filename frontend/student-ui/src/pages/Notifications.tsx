import { useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../components/Card';
import { Async, Field, Page, fieldClass } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import {
  getEmailPref, getWhatsappPref, listNotifications, markAllNotificationsRead, markNotificationRead, setEmailPref, setWhatsappPref,
} from '../api/services';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/format';
import { kindLabel, noticeText } from '../lib/notice';
import { useLoad } from '../lib/useLoad';
import { notifyUnreadChanged } from '../lib/unread';

function EmailPref() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, reload] = useLoad(getEmailPref);
  return (
    <Async state={state} retry={reload} rows={1}>
      {(p) => (
        <>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={p.enabled} onChange={async (e) => { try { const r = await setEmailPref(e.target.checked); toast(r.enabled ? 'Email notifications on' : 'Email notifications off'); reload(); } catch (err) { toast(err instanceof Error ? err.message : 'Could not save', true); } }} />
            Email me reminders and decisions at {user?.email || 'my account email'}
          </label>
          {p.available === false && <p className="mt-2 text-[13px] text-muted">Email delivery is not configured on this server yet; your choice is saved for when it is.</p>}
        </>
      )}
    </Async>
  );
}

function WhatsappPref() {
  const toast = useToast();
  const [state, reload] = useLoad(getWhatsappPref);
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  return (
    <Async state={state} retry={reload} rows={2}>
      {(p) => {
        const on = enabled ?? p.enabled;
        const submit = async (e: FormEvent) => {
          e.preventDefault();
          try { await setWhatsappPref({ phone_e164: phone.trim() || null, enabled: on, consent }); toast(on ? 'WhatsApp notifications enabled' : 'WhatsApp notifications turned off'); setEnabled(null); setPhone(''); reload(); }
          catch (err) { toast(err instanceof Error ? err.message : 'Could not update WhatsApp settings', true); }
        };
        return (
          <form onSubmit={submit} className="max-w-[480px] space-y-3">
            <p className="text-[14px] text-muted">{p.enabled ? 'Enabled' + (p.phone_last4 ? ` · number ending ${p.phone_last4}` : '') : 'Optional. Your number stays private and is never shown in the inbox.'}</p>
            <Field label="WhatsApp number (international format)"><input className={fieldClass} type="tel" inputMode="tel" autoComplete="tel" pattern="\+[1-9][0-9]{7,14}" placeholder={p.phone_last4 ? `Saved number ending in ${p.phone_last4}` : '+14155552671'} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={on} onChange={(e) => setEnabled(e.target.checked)} /> Send activity reminders to this number</label>
            <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to receive Mirai updates on WhatsApp. I can turn this off here at any time.</label>
            <Button type="submit">{p.enabled ? 'Update WhatsApp settings' : 'Save WhatsApp settings'}</Button>
          </form>
        );
      }}
    </Async>
  );
}

export default function Notifications() {
  const [state, reload] = useLoad(() => listNotifications(100));
  const refresh = () => { reload(); notifyUnreadChanged(); };
  return (
    <Page title="Notifications" subtitle="Updates about your activities, deadlines and decisions.">
      <Card className="p-[18px]">
        <Async state={state} retry={reload}>
          {(r) => (
            <>
              <CardHeader title="Inbox" action={
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-muted">{fmt.n(r.unread_count)} unread</span>
                  {r.unread_count > 0 && <Button small variant="secondary" onClick={async () => { await markAllNotificationsRead(); refresh(); }}>Mark all read</Button>}
                  <Button small variant="secondary" onClick={async () => refresh()}>Refresh</Button>
                </div>} />
              <DataTable rows={r.items} rowKey={(n) => n.id} empty="Your inbox is empty" columns={[
                { header: 'Notice', cell: (n) => <><strong>{kindLabel(n.kind)}</strong><div className="text-[12px] text-muted">{noticeText(n)}</div></> },
                { header: 'Received', cell: (n) => <span className="whitespace-nowrap">{fmt.dt(n.send_at)}</span> },
                { header: 'Status', cell: (n) => (
                  <div className="flex flex-wrap gap-1">
                    {n.cancelled_at ? <StatusPill status="outdated" label="Outdated (rescheduled)" /> : <StatusPill status={n.read_at ? 'read' : 'unread'} />}
                    {(n.deliveries ?? []).map((d) => <StatusPill key={d.channel} status={d.status} label={`${d.channel === 'email' ? 'Email' : 'WhatsApp'}: ${d.status}`} />)}
                  </div>) },
                { header: '', cell: (n) => (!n.read_at ? <Button small variant="secondary" onClick={async () => { await markNotificationRead(n.id); refresh(); }}>Mark read</Button> : null) },
              ]} />
            </>
          )}
        </Async>
      </Card>
      <Card className="p-[18px]"><CardHeader title="Email" /><div className="mt-3"><EmailPref /></div></Card>
      <Card className="p-[18px]"><CardHeader title="WhatsApp reminders" /><div className="mt-3"><WhatsappPref /></div></Card>
    </Page>
  );
}
