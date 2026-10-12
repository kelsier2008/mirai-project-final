import { AlertCircle } from 'lucide-react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted">
      <AlertCircle size={28} strokeWidth={1.5} className="text-danger" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 rounded-field border border-line bg-white px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-primary-soft">
          Try again
        </button>
      )}
    </div>
  );
}
