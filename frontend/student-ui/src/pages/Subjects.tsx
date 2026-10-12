import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { ErrorState } from '../components/ErrorState';
import { Pill } from '../components/Pill';
import { Skeleton } from '../components/Skeleton';
import { SubjectCard } from '../components/SubjectCard';
import { getAcademicProfile, getAssignments, getSubjects } from '../api/services';
import type { Assignment } from '../api/types';
import { useAsync } from '../lib/useAsync';

const dueLabel = (d: number) => (d < 0 ? 'Overdue' : d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`);

function groupBySubject(list: Assignment[]) {
  const map = new Map<string, Assignment[]>();
  list.forEach((a) => map.set(a.subject, [...(map.get(a.subject) ?? []), a]));
  return [...map.entries()];
}

export default function Subjects() {
  const [subjects, retrySubjects] = useAsync(getSubjects);
  const [assignments, retryAssignments] = useAsync(getAssignments);
  const [academic] = useAsync(getAcademicProfile);
  const count = subjects.status === 'ready' ? subjects.data.length : null;

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-[26px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold leading-10 text-ink">My Subjects</h1>
          <p className="mt-2 text-[16px] text-muted">{count === null ? 'Loading your subjects…' : `You're enrolled in ${count} subjects this semester`}</p>
        </div>
        <label className="relative">
          <span className="sr-only">Semester</span>
          <select
            defaultValue={academic.status === 'ready' ? academic.data.semester : 'Semester 1'}
            className="h-11 cursor-pointer appearance-none rounded-full border border-line bg-white pl-5 pr-11 text-[15px] font-medium text-ink shadow-card transition-colors hover:bg-primary-soft/50"
          >
            {/* TODO(api): semester list */}
            <option>Semester 1</option>
          </select>
          <ChevronDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink" />
        </label>
      </div>

      <section className="mt-6 rounded-card border border-line bg-white p-[18px] shadow-card" aria-labelledby="pending">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 id="pending" className="text-[20px] font-medium text-ink">Pending assignments</h2>
            {assignments.status === 'ready' && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-teal-badge px-2 text-[13px] font-semibold text-teal-ink">{assignments.data.length}</span>
            )}
          </div>
          <Link to="/courses" className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-white px-4 py-1.5 text-[14px] font-medium text-ink transition-colors hover:bg-primary-soft/60">See All <ChevronRight size={14} strokeWidth={1.5} /></Link>
        </div>
        <div className="mt-4 grid gap-x-[22px] gap-y-5 md:grid-cols-2">
          {assignments.status === 'loading' && <><Skeleton className="h-[52px]" /><Skeleton className="h-[52px]" /></>}
          {assignments.status === 'error' && <div className="md:col-span-2"><ErrorState message={assignments.message} onRetry={retryAssignments} /></div>}
          {assignments.status === 'ready' && (assignments.data.length === 0
            ? <p className="md:col-span-2 py-4 text-center text-muted">You're all caught up.</p>
            : groupBySubject(assignments.data).map(([name, list]) => (
              <div key={name}>
                <h3 className="mb-3 text-[16px] font-medium text-ink">{name} ({list.length})</h3>
                <ul className="space-y-[10px]">
                  {list.map((a) => (
                    <li key={a.id} className="flex h-[52px] items-center gap-3 rounded-[10px] bg-bar px-4">
                      <FileText size={18} strokeWidth={1.5} className="shrink-0 text-ink" />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{a.title}</span>
                      <Pill tone="danger" className={a.dueInDays < 0 ? '' : '!text-ink'}>{dueLabel(a.dueInDays)}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            )))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.status === 'loading' && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[220px]" />)}
        {subjects.status === 'error' && <div className="col-span-full"><ErrorState message={subjects.message} onRetry={retrySubjects} /></div>}
        {subjects.status === 'ready' && subjects.data.map((s) => <SubjectCard key={s.id} subject={s} />)}
      </div>
    </div>
  );
}
