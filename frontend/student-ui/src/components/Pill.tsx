import type { ReactNode } from 'react';

type Tone = 'outline' | 'success' | 'danger' | 'white' | 'teal';
const tones: Record<Tone, string> = {
  outline: 'bg-white border border-line text-ink',
  success: 'bg-success-soft text-success border border-transparent',
  danger: 'bg-white text-danger border border-transparent',
  white: 'bg-white text-primary border border-transparent shadow-sm',
  teal: 'bg-teal-badge text-teal-ink border border-transparent',
};

export function Pill({ tone = 'outline', className = '', children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-[3px] text-[12.5px] font-medium leading-5 whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}
