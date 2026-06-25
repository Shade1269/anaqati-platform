import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { EmployeeSession } from '../lib/types';
import { setCurrency } from '../lib/format';

const STORAGE_KEY = 'employee_session';

interface EmployeeAuthState {
  session: EmployeeSession | null;
  setSession: (s: EmployeeSession) => void;
  signOut: () => void;
}

const EmployeeAuthContext = createContext<EmployeeAuthState | undefined>(
  undefined
);

function load(): EmployeeSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EmployeeSession) : null;
  } catch {
    return null;
  }
}

export function EmployeeAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<EmployeeSession | null>(() => {
    const s = load();
    if (s) setCurrency(s.currency);
    return s;
  });

  function setSession(s: EmployeeSession) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setCurrency(s.currency);
    setSessionState(s);
  }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
  }

  return (
    <EmployeeAuthContext.Provider value={{ session, setSession, signOut }}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  const ctx = useContext(EmployeeAuthContext);
  if (!ctx)
    throw new Error('useEmployeeAuth must be used within EmployeeAuthProvider');
  return ctx;
}
