import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { currentSession, login as signIn, logout as signOut, restoreSession, sessionEvents } from '@/api';
import type { Account } from '@/types';
interface AuthState { account: Account | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const changed = () => { if (active) setAccount(currentSession()?.account || null); };
    sessionEvents.addEventListener('change', changed);
    restoreSession().then(value => { if (active) setAccount(value); }).catch(() => { if (active) setAccount(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; sessionEvents.removeEventListener('change', changed); };
  }, []);
  return <AuthContext.Provider value={{ account, loading, login: async (email, password) => { setAccount(await signIn(email, password)); }, logout: async () => { await signOut(); } }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is required'); return value; }
