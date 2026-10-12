import type { EventItem } from '../api/types';
import { Pill } from './Pill';

const tone = { Present: 'success', Absent: 'danger', Upcoming: 'outline' } as const;

export function EventCard({ event, className = '' }: { event: EventItem; className?: string }) {
  return (
    <article className={`rounded-[14px] bg-panel p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <Pill tone="outline">{event.kind}</Pill>
        <Pill tone={tone[event.attendance]}>{event.attendance}</Pill>
      </div>
      <p className="mt-4 text-[14px] text-ink">{event.start && `${event.start} - ${event.end}`}</p>
      <h3 className="mt-1 text-[18px] font-semibold leading-6 text-ink">{event.title}</h3>
      <p className="mt-1 text-[13px] text-muted">{event.category} <span aria-hidden="true">·</span> {event.mode}</p>
    </article>
  );
}
