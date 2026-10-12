import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAsync } from '../lib/useAsync';
import { getAcademicProfile } from '../api/services';

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [academic] = useAsync(getAcademicProfile);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Help page shows "BTECH · Semester 1" in the top bar; Home puts its badge in the page itself.
  const chip = pathname === '/help' && academic.status === 'ready' ? `${academic.data.program} · ${academic.data.semester}` : undefined;

  return (
    <div className="flex h-full">
      <aside className="hidden w-sidebar shrink-0 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[275px] max-w-[85vw]">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="on-dark absolute right-2 top-3 rounded-lg p-2 text-white hover:bg-white/10">
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} chip={chip} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden"><Outlet /></main>
      </div>
    </div>
  );
}
