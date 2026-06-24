import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Button, Field, Input, ErrorBanner } from '../../components/ui';
import { firstAllowedRoute } from './RequireCapability';

// بوابة المشتركين (أصحاب المتاجر والمدراء) — دخول فقط.
// الحسابات يُنشئها مالك المنصة من لوحة المنصة. لا علاقة لها بإدارة المشروع.
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { refreshProfile } = useAdminAuth();
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

      // حساب مالك المنصة لا يدخل من بوابة العملاء
      if (profile?.is_platform_admin) {
        await supabase.auth.signOut();
        throw new Error('هذا حساب مالك المنصة. استخدم بوابة لوحة المنصة الخاصة (/owner).');
      }
      // حساب غير مُفعّل / غير مرتبط بمشترك
      if (!profile || (profile.role !== 'admin' && profile.role !== 'inventory_manager')) {
        await supabase.auth.signOut();
        throw new Error('حسابك غير مُفعّل أو لا يملك صلاحية. تواصل مع إدارة النظام.');
      }

      if (profile.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        const target = firstAllowedRoute(profile.permissions);
        if (!target) {
          await supabase.auth.signOut();
          throw new Error('لم يتم منحك أي صلاحية بعد. تواصل مع المالك.');
        }
        navigate(target);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute -top-32 right-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <form
        onSubmit={onSubmit}
        className="ax-card relative w-full max-w-md space-y-5 p-7"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
            <Building2 size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-text">دخول المشترك</h1>
          <p className="mt-1 text-sm text-muted">
            لأصحاب المتاجر والمدراء — ادخل ببيانات حسابك
          </p>
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

        <p className="text-center text-xs text-muted">
          ليس لديك حساب؟ تواصل مع إدارة النظام لتفعيل اشتراكك.
        </p>

        <Link
          to="/employee/login"
          className="flex items-center justify-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight size={14} /> دخول الموظفين (جوال + كود)
        </Link>
      </form>
    </div>
  );
}
