import type { Subject } from '../api/types';

// Flat illustrations for the subject card headers.
export function SubjectArt({ art }: { art: Subject['art'] }) {
  const common = { width: 150, height: 100, viewBox: '0 0 150 100', 'aria-hidden': true as const };
  switch (art) {
    case 'books':
      return (<svg {...common}><rect x="20" y="22" width="86" height="12" rx="6" fill="#f08c3a" transform="rotate(-4 20 22)"/><rect x="14" y="44" width="92" height="13" rx="6.5" fill="#5b7fd1"/><rect x="26" y="64" width="98" height="14" rx="7" fill="#2f4fa0" transform="rotate(-3 26 64)"/></svg>);
    case 'tablet':
      return (<svg {...common}><rect x="42" y="8" width="92" height="72" rx="6" fill="#fff" stroke="#4a3c8f" strokeWidth="5"/><path d="M52 62l20-24 14 14 14-22 18 18" fill="none" stroke="#f0a73a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><rect x="14" y="52" width="62" height="9" rx="4.5" fill="#f5c542" transform="rotate(-35 14 52)"/></svg>);
    case 'envelope':
      return (<svg {...common}><rect x="30" y="38" width="100" height="52" rx="4" fill="#1d7a4d"/><path d="M30 38l50 30 50-30" fill="#2f9b64"/><rect x="62" y="30" width="60" height="8" rx="2" fill="#d9532a"/><rect x="14" y="52" width="58" height="9" rx="4.5" fill="#43b97e" transform="rotate(-35 14 52)"/></svg>);
    case 'notepad':
      return (<svg {...common}><rect x="32" y="14" width="80" height="78" rx="6" fill="#f5bd4a"/><rect x="48" y="8" width="80" height="78" rx="6" fill="#fff" stroke="#6a3f95" strokeWidth="5"/><path d="M62 30h50M62 44h50M62 58h36" stroke="#cdbbe0" strokeWidth="3" strokeLinecap="round"/><rect x="12" y="46" width="58" height="9" rx="4.5" fill="#f5c542" transform="rotate(-35 12 46)"/></svg>);
    case 'pen':
      return (<svg {...common}><rect x="40" y="22" width="86" height="12" rx="6" fill="#e0584a"/><rect x="34" y="42" width="92" height="13" rx="6.5" fill="#43b97e"/><rect x="40" y="62" width="86" height="14" rx="7" fill="#1d7a4d"/><rect x="8" y="50" width="52" height="9" rx="4.5" fill="#43b97e" transform="rotate(-30 8 50)"/></svg>);
    case 'check':
      return (<svg {...common}><circle cx="96" cy="56" r="26" fill="#fff" stroke="#e0703a" strokeWidth="5"/><path d="M84 56l9 9 17-19" fill="none" stroke="#e0703a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><rect x="14" y="62" width="62" height="9" rx="4.5" fill="#5b7fd1" transform="rotate(-25 14 62)"/><rect x="30" y="72" width="70" height="10" rx="5" fill="#2f4fa0"/></svg>);
  }
}
