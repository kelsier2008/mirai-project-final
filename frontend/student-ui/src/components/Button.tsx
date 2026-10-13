import { useState, type ButtonHTMLAttributes } from 'react';
import { useToast } from './Toast';

type Variant = 'primary' | 'secondary' | 'danger';
const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-navy',
  secondary: 'bg-white text-ink border border-line hover:bg-primary-soft',
  danger: 'bg-white text-danger border border-line hover:bg-red-50',
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: Variant;
  small?: boolean;
  /** Async handler: the button disables itself while it runs and errors become a toast. */
  onClick?: () => Promise<unknown> | unknown;
}

export function Button({ variant = 'primary', small, onClick, children, className = '', type = 'button', disabled, ...rest }: Props) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      onClick={onClick && (async () => {
        setBusy(true);
        try { await onClick(); } catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong', true); } finally { setBusy(false); }
      })}
      className={`inline-flex items-center justify-center rounded-field font-medium transition-colors duration-150 disabled:opacity-60 ${small ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]'} ${styles[variant]} ${className}`}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}
