import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function AccordionItem({ question, children }: { question: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-[10px] border border-line bg-white shadow-card self-start">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[58px] w-full items-center justify-between gap-4 px-5 py-3 text-left text-[16px] text-ink transition-colors duration-150 hover:bg-primary-soft/50 rounded-[10px]"
      >
        <span>{question}</span>
        <ChevronRight size={18} strokeWidth={1.5} className={`shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div id={id} role="region" className="px-5 pb-4 text-[15px] leading-6 text-muted">
          {children}
        </div>
      )}
    </div>
  );
}
