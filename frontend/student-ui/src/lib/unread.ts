import { useEffect, useState } from 'react';
import { listNotifications } from '../api/services';

const EVT = 'mirai:unread-changed';
export const notifyUnreadChanged = () => window.dispatchEvent(new Event(EVT));

/** Unread notification count for the sidebar badge; refreshes every 45s and on demand. */
export function useUnreadCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => listNotifications(1).then((r) => live && setN(r.unread_count), () => live && setN(0));
    load();
    const t = setInterval(load, 45_000);
    window.addEventListener(EVT, load);
    return () => { live = false; clearInterval(t); window.removeEventListener(EVT, load); };
  }, []);
  return n;
}
