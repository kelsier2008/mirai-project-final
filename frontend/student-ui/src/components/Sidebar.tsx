import { NavLink } from 'react-router-dom';
import { Award, Bell, BookOpen, CalendarDays, CircleHelp, FileCheck, House, LogOut, ScrollText, UserCheck, Users, WalletCards, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Logo } from './Logo';
import { ConfirmDialog } from './ConfirmDialog';
import { initials, useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { getAcademicProfile } from '../api/services';
import { useUnreadCount } from '../lib/unread';

export const navItems: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/attendance', label: 'My Attendance', icon: UserCheck },
  { to: '/fees', label: 'Fee Payment', icon: WalletCards },
  { to: '/courses', label: 'My Courses', icon: BookOpen },
  { to: '/academy', label: 'Mirai Academy', icon: BookOpen },
  { to: '/help', label: 'Help & FAQs', icon: CircleHelp },
];

// Club-tracker pages carried over from the previous student portal.
export const moreItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/submit', label: 'Submissions', icon: FileCheck },
  { to: '/certificates', label: 'Certificates', icon: Award },
  { to: '/records', label: 'My Record', icon: ScrollText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

const row = 'on-dark flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium transition-colors duration-150 w-full';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [academic] = useAsync(getAcademicProfile);
  const unread = useUnreadCount();
  const program = academic.status === 'ready' ? academic.data.program : '';
  return (
    <div className="flex h-full flex-col text-white" style={{ background: 'var(--sidebar-gradient)' }}>
      <div className="px-5 pt-[18px] pb-4"><Logo /></div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-4">
        <ul className="flex flex-col gap-[1.5px]">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) => `${row} ${isActive ? 'bg-white text-primary' : 'text-white/90 hover:bg-white/10'}`}
              >
                <Icon size={20} strokeWidth={1.5} />
                {label}
              </NavLink>
            </li>
          ))}
          {moreItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} onClick={onNavigate} className={({ isActive }) => `${row} ${isActive ? 'bg-white text-primary' : 'text-white/90 hover:bg-white/10'}`}>
                <Icon size={20} strokeWidth={1.5} />
                <span className="flex-1">{label}</span>
                {to === '/notifications' && unread > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] font-bold text-primary" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="mt-5 mb-2 px-3 text-[12px] font-semibold uppercase tracking-wider text-white/55">Settings</p>
        <button type="button" onClick={() => setConfirming(true)} className={`${row} text-white/90 hover:bg-white/10`}>
          <LogOut size={20} strokeWidth={1.5} />
          Log Out
        </button>
      </nav>
      <div className="mx-3 border-t border-white/15 px-2 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-[13px] font-semibold ring-1 ring-white/20">
            {user ? initials(user.name) : '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-5">{user?.name}</p>
            <p className="text-[12px] uppercase tracking-wide text-white/55">{program}</p>
          </div>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Log out?"
          message="Are you sure you want to log out of your Mirai account?"
          confirmLabel="Log Out"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onNavigate?.(); signOut(); }}
        />
      )}
    </div>
  );
}
