import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { adminApi } from '../lib/api';
import { setCurrency } from '../lib/format';
import type { MyProfile } from '../lib/types';

interface AdminAuthState {
  loading: boolean;
  authed: boolean;
  profile: MyProfile | null;
  refreshProfile: (fullName?: string) => Promise<MyProfile | null>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  async function loadProfile() {
    try {
      const p = await adminApi.myProfile();
      setProfile(p);
      setCurrency(p?.tenant?.currency);
      return p;
    } catch {
      setProfile(null);
      return null;
    }
  }

  async function refreshProfile(fullName?: string) {
    // ensure_my_profile creates the profile on first login; my_profile fetches it.
    try {
      await adminApi.ensureMyProfile(fullName || 'مستخدم');
    } catch {
      // ignore - profile may already exist; my_profile is the source of truth.
    }
    return loadProfile();
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        setAuthed(true);
        await loadProfile();
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
      if (!session) setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setAuthed(false);
    setProfile(null);
  }

  return (
    <AdminAuthContext.Provider
      value={{ loading, authed, profile, refreshProfile, signOut }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
