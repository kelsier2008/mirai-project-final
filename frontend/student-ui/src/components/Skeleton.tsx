export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);
