import { statusLabel, statusTone, type Tone } from '../lib/format';

const tones: Record<Tone, string> = {
  good: 'bg-success-soft text-success',
  alert: 'bg-red-50 text-danger',
  wait: 'bg-amber-50 text-amber-700',
  info: 'bg-primary-soft text-primary',
  neutral: 'bg-panel text-muted',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-[2px] text-[12px] font-medium whitespace-nowrap ${tones[statusTone(status)]}`}>
      {label ?? statusLabel(status)}
    </span>
  );
}
