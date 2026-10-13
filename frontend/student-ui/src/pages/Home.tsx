import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, ArrowRight } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { Donut } from '../components/Donut';
import { ErrorState } from '../components/ErrorState';
import { EventCard } from '../components/EventCard';
import { CoursesIcon, FeeIcon, HelpIcon, ScheduleIcon } from '../components/ExploreIcons';
import { Skeleton } from '../components/Skeleton';
import { highlightImages } from '../assets';
import { getAcademicProfile, getAttendanceSummary, getEvents, getHighlights } from '../api/services';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';

const tiles = [
  { to: '/calendar', label: 'Schedule', icon: ScheduleIcon },
  { to: '/courses', label: 'My Courses', icon: CoursesIcon },
  { to: '/fees', label: 'Fee Payment', icon: FeeIcon },
  { to: '/help', label: 'Help', icon: HelpIcon },
];

export default function Home() {
  const { user } = useAuth();
  const first = user?.name.split(/\s+/)[0] ?? '';
  const [academic] = useAsync(getAcademicProfile);
  const [events, retryEvents] = useAsync(getEvents);
  const [attendance, retryAttendance] = useAsync(getAttendanceSummary);
  const [highlights, retryHighlights] = useAsync(getHighlights);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-[38px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-medium leading-9 text-ink sm:text-[30px]">Hello, {first} <span aria-hidden="true">🌟</span></h1>
        {academic.status === 'ready' && (
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-[15px] font-medium text-muted shadow-card">
            <GraduationCap size={17} strokeWidth={1.5} />
            {academic.data.program} · {academic.data.batch}
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-6">
        <Card className="p-[18px] lg:col-span-2">
          <CardHeader title="Explore" />
          <div className="mt-3 grid grid-cols-2 gap-[14px]">
            {tiles.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex aspect-[1.12] flex-col items-center justify-center gap-3 rounded-[12px] border border-line bg-white shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-lift">
                <Icon />
                <span className="text-[15px] font-medium text-ink">{label}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-[18px] lg:col-span-4">
          <CardHeader title="Events" action={<Link to="/calendar" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink transition-colors hover:text-primary">View all <ChevronRight size={15} strokeWidth={1.5} /></Link>} />
          <div className="mt-3">
            {events.status === 'loading' && <div className="grid gap-[14px] sm:grid-cols-2 sm:grid-rows-2"><Skeleton className="h-40 sm:row-span-2 sm:h-full sm:min-h-[325px]" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}
            {events.status === 'error' && <ErrorState message={events.message} onRetry={retryEvents} />}
            {events.status === 'ready' && (
              events.data.length === 0 ? <p className="py-8 text-center text-sm text-muted">No upcoming Club Days. Join a club to see its sessions here.</p> : (
                <div className="grid gap-[14px] sm:grid-cols-2 sm:grid-rows-2">
                  {events.data.map((e, i) => <EventCard key={e.id} event={e} className={i === 0 ? 'sm:row-span-2 min-h-[160px]' : ''} />)}
                </div>
              )
            )}
          </div>
        </Card>

        <Card className="p-[18px] lg:col-span-4">
          <CardHeader title="Highlights" />
          <div className="mt-3 grid gap-[14px] sm:grid-cols-[1.6fr_1fr]">
            {highlights.status === 'loading' && <><Skeleton className="h-[280px]" /><Skeleton className="h-[280px]" /></>}
            {highlights.status === 'error' && <div className="sm:col-span-2"><ErrorState message={highlights.message} onRetry={retryHighlights} /></div>}
            {highlights.status === 'ready' && highlights.data.map((h) => (
              <img key={h.id} src={highlightImages[h.image]} alt={h.alt} loading="lazy" className="h-[280px] w-full rounded-[12px] object-cover" />
            ))}
          </div>
        </Card>

        <Card className="p-[22px] lg:col-span-2">
          <CardHeader title="Attendance" action={<Link to="/attendance" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink transition-colors hover:text-primary">View all <ArrowRight size={15} strokeWidth={1.5} /></Link>} />
          {attendance.status === 'loading' && <div className="mt-6 flex flex-col items-center gap-5"><Skeleton className="h-[165px] w-[165px] !rounded-full" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /></div>}
          {attendance.status === 'error' && <ErrorState message={attendance.message} onRetry={retryAttendance} />}
          {attendance.status === 'ready' && (
            <>
              {attendance.data.present + attendance.data.absent === 0 && <p className="mt-4 text-center text-sm text-muted">No attendance recorded yet.</p>}
              <div className="mt-5 flex justify-center"><Donut present={attendance.data.present} absent={attendance.data.absent} /></div>
              <ul className="mt-6 space-y-3 text-[16px] text-ink">
                <li className="flex items-center justify-between"><span className="flex items-center gap-3"><i className="h-3 w-3 rounded-[3px] bg-success" />Present</span><span className="font-medium">{attendance.data.present}</span></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-3"><i className="h-3 w-3 rounded-[3px] bg-danger-bar" />Absent</span><span className="font-medium">{attendance.data.absent}</span></li>
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
