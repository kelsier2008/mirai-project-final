export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 text-white ${className}`} aria-label="Mirai">
      <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
        <path d="M2 24 8 4l5 11 5-11 4 20M14 24l5-11 5 11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="26" cy="5" r="2.4" fill="#fff" />
      </svg>
      <span className="text-[24px] font-bold tracking-tight leading-none">Mirai</span>
    </div>
  );
}
