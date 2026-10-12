import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn, notice } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await signIn(identifier.trim(), password); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in'); }
    finally { setBusy(false); }
  }

  const field = 'mt-1.5 h-11 w-full rounded-field border border-line bg-white px-3.5 text-[15px] text-ink transition-colors focus:border-primary';
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10" style={{ background: 'var(--sidebar-gradient)' }}>
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-card bg-white p-8 shadow-lift">
        <div className="inline-block rounded-field bg-navy px-4 py-3"><Logo /></div>
        <h1 className="mt-6 text-[24px] font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-[14px] text-muted">Use your student email or student ID.</p>
        {(error || notice) && (
          <p role="alert" className={`mt-4 rounded-field px-3 py-2 text-[14px] ${error ? 'bg-red-50 text-danger' : 'bg-primary-soft text-ink'}`}>{error ?? notice}</p>
        )}
        <label className="mt-5 block text-[14px] font-medium text-ink">Email or student ID
          <input className={field} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        </label>
        <label className="mt-4 block text-[14px] font-medium text-ink">Password
          <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button disabled={busy} className="mt-6 h-11 w-full rounded-field bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-navy disabled:opacity-60">
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
