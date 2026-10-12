import { useMemo, useState } from 'react';
import { GraduationCap, Landmark, IdCard, MessageCircleQuestionMark, FileText, type LucideIcon } from 'lucide-react';
import { AccordionItem } from '../components/Accordion';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { faqCategories } from '../data/mock';
import { getFaqs } from '../api/services';
import type { FaqCategoryId } from '../api/types';
import { useAsync } from '../lib/useAsync';

const icons: Record<FaqCategoryId, LucideIcon> = {
  eligibility: MessageCircleQuestionMark,
  selection: IdCard,
  program: Landmark,
  scholarship: FileText,
  internships: GraduationCap,
  placements: GraduationCap,
};

export default function Help() {
  const [faqs, retry] = useAsync(getFaqs);
  const [active, setActive] = useState<FaqCategoryId | null>(null);
  const visible = useMemo(
    () => (faqs.status === 'ready' ? faqs.data.filter((f) => !active || f.category === active) : []),
    [faqs, active],
  );

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-[35px]">
      <h1 className="text-[28px] font-medium leading-9 text-ink sm:text-[32px]">How can we help you?</h1>
      <ul className="mt-6 grid grid-cols-2 gap-[17px] md:grid-cols-3 xl:grid-cols-5">
        {faqCategories.map((c) => {
          const Icon = icons[c.id];
          const on = active === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setActive(on ? null : c.id)}
                className={`relative flex h-[113px] w-full items-end rounded-[10px] bg-white p-[17px] text-left text-[17px] font-medium leading-[22px] text-ink shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-lift ${on ? 'ring-2 ring-primary' : ''}`}
              >
                <Icon aria-hidden="true" size={42} strokeWidth={1.5} className="absolute right-4 top-4 text-[#b8cdf0]" />
                {c.label}
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-14 text-[26px] font-medium text-ink">Frequently Asked Question</h2>
      <div className="mt-5">
        {faqs.status === 'loading' && <div className="grid gap-[14px] md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[60px]" />)}</div>}
        {faqs.status === 'error' && <ErrorState message={faqs.message} onRetry={retry} />}
        {faqs.status === 'ready' && (
          visible.length === 0
            ? <p className="py-6 text-muted">No questions in this category yet.</p>
            : <div className="grid gap-x-[14px] gap-y-[14px] md:grid-cols-2">{visible.map((f) => <AccordionItem key={f.id} question={f.question}>{f.answer}</AccordionItem>)}</div>
        )}
      </div>

      {/* TODO: placeholder for an answer / contact-support panel */}
      <Card className="mt-12 min-h-[170px] rounded-[10px]"><span className="sr-only">Support panel</span></Card>
    </div>
  );
}
