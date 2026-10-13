import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-auto rounded-card bg-white p-6 shadow-lift ${wide ? 'max-w-[900px]' : 'max-w-[480px]'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-muted hover:bg-primary-soft"><X size={20} strokeWidth={1.5} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
