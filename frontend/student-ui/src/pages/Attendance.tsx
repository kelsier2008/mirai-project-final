import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../components/Card';
import { Async, Page, Field, fieldClass } from '../components/Page';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { getCheckinSession, listMyAttendance, scanCheckin } from '../api/services';
import type { CheckinSessionDto } from '../api/types';
import { ApiError } from '../api/client';
import { dayWhen, fmt } from '../lib/format';
import { useLoad } from '../lib/useLoad';

const place = () =>
  new Promise<{ lat?: number; lng?: number }>((res) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 2500 })
      : res({}));

declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } } }

export default function Attendance() {
  const toast = useToast();
  const [history, reloadHistory] = useLoad(listMyAttendance);
  const [sid, setSid] = useState(() => { try { return sessionStorage.getItem('lastCheckin') ?? ''; } catch { return ''; } });
  const [code, setCode] = useState('');
  const [session, setSession] = useState<{ s: CheckinSessionDto; just: boolean } | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function showStatus(id: string, just = false) {
    try {
      const s = await getCheckinSession(id);
      setSession({ s, just });
      setSessionError(null);
      try { sessionStorage.setItem('lastCheckin', String(id)); } catch { /* storage blocked */ }
    } catch (e) {
      setSession(null);
      setSessionError(e instanceof Error ? e.message : 'No session with that ID for your clubs.');
    }
  }
  useEffect(() => { if (/^\d+$/.test(sid)) void showStatus(sid); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submit(idIn: string, tokenIn: string) {
    let id = idIn.trim(), token = tokenIn.trim();
    if (token.startsWith('CLUBCHK:')) [, id, token] = token.split(':');
    if (!/^\d+$/.test(id)) throw new Error('Enter the numeric session ID shown with the QR code');
    if (!token) throw new Error('Enter the code shown on the screen');
    setSid(id);
    try {
      const r = await scanCheckin({ session_id: +id, token, ...(await place()) });
      toast(r.is_late ? 'Checked in (late)' : 'Checked in!');
      await showStatus(id, true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /already/i.test(e.message)) { toast('You are already checked in to this session'); await showStatus(id); return; }
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) await showStatus(id);
      throw e;
    }
    setCode('');
    reloadHistory();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try { await submit(sid, code); } catch (err) { toast(err instanceof Error ? err.message : 'Could not check in', true); }
  }

  // Camera QR scanning where the browser supports BarcodeDetector.
  useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const det = new window.BarcodeDetector!({ formats: ['qr_code'] });
        while (!stop) {
          const r = await det.detect(v).catch(() => []);
          if (r[0]?.rawValue.startsWith('CLUBCHK:')) {
            setScanning(false);
            await submit('', r[0].rawValue).catch((err: Error) => toast(err.message, true));
            return;
          }
          await new Promise((res) => setTimeout(res, 350));
        }
      } catch { toast('Could not open the camera', true); setScanning(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const m = session?.s.my_checkin;
  return (
    <Page title="My Attendance" subtitle="Check in with the code on the screen and see your saved attendance.">
      <Card className="p-[18px]">
        <CardHeader title="Check in" />
        <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-[160px_1fr_auto] md:items-end">
          <Field label="Session ID"><input className={fieldClass} inputMode="numeric" pattern="[0-9]+" autoComplete="off" value={sid}
            onChange={(e) => setSid(e.target.value)} onBlur={() => /^\d+$/.test(sid.trim()) && showStatus(sid.trim())} /></Field>
          <Field label="Code from the screen (or paste the full CLUBCHK:… text)"><input className={fieldClass} autoComplete="off" value={code}
            onChange={(e) => { const v = e.target.value; setCode(v); if (v.trim().startsWith('CLUBCHK:')) setSid(v.trim().split(':')[1] ?? ''); }} /></Field>
          <Button type="submit">Check in</Button>
        </form>
        {typeof window !== 'undefined' && window.BarcodeDetector
          ? <div className="mt-3"><Button variant="secondary" small onClick={() => setScanning((s) => !s)}>{scanning ? 'Stop camera' : 'Scan QR with camera'}</Button>{scanning && <video ref={videoRef} playsInline muted className="mt-3 w-[280px] rounded-field" />}</div>
          : <p className="mt-3 text-[13px] text-muted">This browser cannot scan with the camera. Type the session ID and code shown on the screen.</p>}
        <div aria-live="polite" className="mt-4">
          {sessionError && <p role="alert" className="rounded-field bg-red-50 px-3 py-2 text-[14px] text-danger">{sessionError}</p>}
          {session && (
            <div className={`rounded-field px-4 py-3 ${m ? 'bg-success-soft' : 'bg-panel'}`}>
              <p className="font-semibold text-ink">{m ? (session.just ? 'You are checked in' : 'Already checked in') : session.s.status === 'live' ? 'Not checked in yet' : 'Not checked in'}</p>
              <p className="text-[14px] text-ink">{session.s.club_name} · {session.s.club_day_title || 'Club Day'} · {dayWhen(session.s)}</p>
              <p className="text-[13px] text-muted">
                {m ? `Recorded ${fmt.dt(m.checked_in_at)}${m.is_late ? ' · marked late' : ''}${m.geo_flag ? ' · location flagged for review' : ''}`
                  : session.s.status === 'live' ? `Window closes ${fmt.clock(session.s.closes_at)}. Enter the code shown on the screen.`
                  : `This window ${session.s.status === 'closed' ? 'closed ' + fmt.dt(session.s.closes_at) : 'has not opened yet'}.`}
              </p>
            </div>
          )}
        </div>
      </Card>
      <Card className="p-[18px]">
        <CardHeader title="Saved on the server" />
        <div className="mt-2">
          <Async state={history} retry={reloadHistory}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(a) => a.id} empty="No check-ins yet" columns={[
                { header: 'Session', cell: (a) => `#${a.session_id}` },
                { header: 'Club', cell: (a) => a.club_name },
                { header: 'Club Day', cell: (a) => a.title || 'Club Day' },
                { header: 'Date', cell: (a) => fmt.date(a.day_date) },
                { header: 'Checked in', cell: (a) => fmt.dt(a.checked_in_at) },
                { header: '', cell: (a) => (a.is_late ? <StatusPill status="late" /> : null) },
              ]} />
            )}
          </Async>
        </div>
      </Card>
    </Page>
  );
}
