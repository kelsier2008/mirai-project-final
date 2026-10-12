import { Link } from 'react-router-dom';
import type { Subject } from '../api/types';
import { Pill } from './Pill';
import { SubjectArt } from './SubjectArt';

const bg = { blue: 'bg-[#e6ecf8]', purple: 'bg-[#e8e2f4]', mint: 'bg-[#dcf1e8]' } as const;

export function SubjectCard({ subject }: { subject: Subject }) {
  return (
    <Link
      to={`/courses/${subject.id}`}
      className="block overflow-hidden rounded-subject border border-line bg-white shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className={`relative flex h-[142px] items-center justify-end pr-8 ${bg[subject.tone]}`}>
        <Pill tone="white" className="absolute left-4 top-4">{subject.type}</Pill>
        <SubjectArt art={subject.art} />
      </div>
      <div className="px-5 py-4">
        <h3 className="text-[18px] font-bold leading-6 text-ink">{subject.title}</h3>
        <p className="mt-1 text-[14px] text-muted">{subject.subtitle}</p>
      </div>
    </Link>
  );
}
