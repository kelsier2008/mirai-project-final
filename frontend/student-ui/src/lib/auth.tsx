import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { fetchMe, isStudent, login as apiLogin } from '../api/services';
import type { UserProfile } from '../api/types';

type Status = 'loading' | 'anonymous' | 'authenticated';
interface AuthValue {
  status: Status;
  user: UserProfile | null;
  notice: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: (notice?: string) => void;
}
const Ctx = createContext<AuthValue | null>(null);

const WRONG_ROLE = 'This portal is only for student accounts. Please use the portal for your role.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'loading' : 'anonymous');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback((message?: string) => {
    clearToken();
    setUser(null);
    setNotice(message ?? null);
    setStatus('anonymous');
  }, []);

  useEffect(() => { setUnauthorizedHandler((m) => signOut(m)); }, [signOut]);

  // Resume from the stored token: the server (GET /auth/me) says who this is.
  useEffect(() => {
    if (!getToken()) return;
    fetchMe().then(
      (u) => {
        if (!isStudent(u)) return signOut(WRONG_ROLE);
        setUser(u);
        setStatus('authenticated');
      },
      (e: unknown) => {
        if ((e as { status?: number }).status !== 401) signOut(e instanceof Error ? e.message : undefined);
      },
    );
  }, [signOut]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const r = await apiLogin(identifier, password);
    if (!isStudent(r.user)) throw new Error(WRONG_ROLE);
    setToken(r.access_token);
    setNotice(null);
    setUser(r.user);
    setStatus('authenticated');
  }, []);

  const value = useMemo(() => ({ status, user, notice, signIn, signOut }), [status, user, notice, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
