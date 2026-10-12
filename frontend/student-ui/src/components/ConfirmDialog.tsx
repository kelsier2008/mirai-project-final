import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" className="w-full max-w-[380px] rounded-card bg-white p-6 text-ink shadow-lift">
        <h2 id="confirm-title" className="text-[18px] font-semibold">{title}</h2>
        <p id="confirm-msg" className="mt-2 text-[14.5px] text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="h-10 rounded-field border border-line bg-white px-4 text-[14px] font-medium transition-colors hover:bg-primary-soft">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-10 rounded-field bg-danger px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90">{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
