// Navy line icons with orange accents for the Home "Explore" tiles.
const base = { width: 52, height: 52, viewBox: '0 0 52 52', fill: 'none', 'aria-hidden': true as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2.2 };
const N = '#1b2f6b';
const O = '#e8892c';

export const ScheduleIcon = () => (
  <svg {...base}><rect x="9" y="11" width="34" height="34" rx="6" stroke={N}/><path d="M18 7v8M34 7v8" stroke={N}/><path d="M17 25h18M17 32h18" stroke={O}/><path d="M17 39h10" stroke={N}/></svg>
);
export const CoursesIcon = () => (
  <svg {...base}><path d="M13 8h24a3 3 0 0 1 3 3v31H16a3 3 0 0 1-3-3Z" stroke={N}/><path d="M13 39a3 3 0 0 1 3-3h24" stroke={N}/><path d="M22 18h10M22 25h10" stroke={O}/><path d="M9 14v28" stroke={N}/></svg>
);
export const FeeIcon = () => (
  <svg {...base}><path d="M14 11h24M14 20h24" stroke={O}/><path d="M14 11c14 0 14 18 0 18M14 29l16 14" stroke={N}/></svg>
);
export const HelpIcon = () => (
  <svg {...base}><path d="M9 11a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H24l-9 8v-8h-2a4 4 0 0 1-4-4Z" stroke={N}/><circle cx="19" cy="21" r="1.4" fill={O} stroke={O}/><circle cx="26" cy="21" r="1.4" fill={O} stroke={O}/><circle cx="33" cy="21" r="1.4" fill={O} stroke={O}/></svg>
);
