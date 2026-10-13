import { GraduationCap, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { moreItems, navItems } from './Sidebar';

const titles: Record<string, string> = { '/courses': 'My Subjects' };

export function Topbar({ onMenu, chip }: { onMenu: () => void; chip?: string }) {
  const { pathname } = useLocation();
  const match = [...navItems, ...moreItems].find((n) => (('end' in n && n.end) ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + '/')));
  const title = titles[pathname] ?? (pathname.startsWith('/courses/') ? 'Course' : match?.label ?? 'Home');
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-white px-4 lg:px-[26px]">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onMenu} aria-label="Open navigation" className="rounded-lg p-2 text-ink hover:bg-primary-soft lg:hidden">
          <Menu size={22} strokeWidth={1.5} />
        </button>
        <h1 className="text-[15px] font-medium text-ink">{title}</h1>
      </div>
      {chip && (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-[13.5px] font-medium text-muted shadow-card">
          <GraduationCap size={16} strokeWidth={1.5} />
          {chip}
        </span>
      )}
    </header>
  );
}
