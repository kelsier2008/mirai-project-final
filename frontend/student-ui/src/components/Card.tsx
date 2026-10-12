import type { ReactNode } from 'react';

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`bg-card border border-line rounded-card shadow-card ${className}`}>{children}</section>;
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[20px] font-medium text-ink leading-7">{title}</h2>
      {action}
    </div>
  );
}
