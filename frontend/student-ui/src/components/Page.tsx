import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import type { LoadState } from '../lib/useLoad';

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-[38px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

/** Renders skeleton / error / content for a useLoad state. */
export function Async<T>({ state, retry, children, rows = 3 }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode; rows?: number }) {
  if (state.status === 'loading') return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;
  return <>{children(state.data)}</>;
}

export const fieldClass = 'h-10 w-full rounded-field border border-line bg-white px-3 text-[14px] text-ink transition-colors focus:border-primary';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[13px] font-medium text-ink">{label}<div className="mt-1">{children}</div></label>;
}
