import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Button, Field, Input, ErrorBanner } from '../../components/ui';

/**
 * Private platform-owner entrance. Distinct from the clients' /admin/login.
 * After auth, only `is_platform_admin` users proceed to /platform; anyone else
 * is signed out and told this door is owner-only.
 */
export default function OwnerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { refreshProfile, signOut } = useAdminAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: inErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (inErr) throw new Error(inErr.message);

      const profile = await refreshProfile();
      if (!profile) throw new Error('تعذّر تحميل الملف الشخصي');

      if (profile.is_platform_admin) {
        navigate('/platform');
      } else {
        await signOut();
        setError('غير مصرّح — هذا المدخل لمالك المنصة فقط.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute -top-32 left-10 h-80 w-80 rounded-full bg-info/10 blur-3xl" />
      <form
        onSubmit={onSubmit}
        className="ax-card relative w-full max-w-md space-y-5 p-7"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-text">لوحة تحكم المنصة</h1>
          <p className="mt-1 text-sm text-muted">مدخل خاص بمالك المنصة</p>
        </div>

        <ErrorBanner message={error} />

        <Field label="البريد الإلكتروني">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="كلمة المرور">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </Field>

        <Button type="submit" loading={loading} className="w-full">
          دخول
        </Button>
      </form>
    </div>
  );
}
