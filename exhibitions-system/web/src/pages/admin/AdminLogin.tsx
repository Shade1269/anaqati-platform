import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Button, Field, Input, ErrorBanner } from '../../components/ui';

export default function AdminLogin() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { refreshProfile } = useAdminAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: signErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signErr) throw new Error(signErr.message);
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          setInfo(
            'تم إنشاء الحساب. إذا طُلب تأكيد البريد فعّل الحساب من بريدك ثم سجّل الدخول.'
          );
          setMode('login');
          setLoading(false);
          return;
        }
      } else {
        const { error: inErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (inErr) throw new Error(inErr.message);
      }

      const profile = await refreshProfile(fullName.trim() || 'مستخدم');
      if (!profile) throw new Error('تعذّر تحميل الملف الشخصي');
      // Platform owner is routed to the platform panel; tenant admin/IM stay here.
      navigate(profile.is_platform_admin ? '/platform' : '/admin/dashboard');
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
          <h1 className="text-2xl font-extrabold text-text">دخول الإدارة</h1>
          <p className="mt-1 text-sm text-muted">للأدمن ومدير المخزون</p>
        </div>

        <div className="flex rounded-lg bg-bg-2 p-1 text-sm">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2 font-semibold transition ${
                mode === m
                  ? 'bg-primary text-[hsl(var(--primary-fg))]'
                  : 'text-muted'
              }`}
            >
              {m === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}
            </button>
          ))}
        </div>

        <ErrorBanner message={error} />
        {info && (
          <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
            {info}
          </div>
        )}

        {mode === 'signup' && (
          <Field label="الاسم الكامل">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
        )}

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
          {mode === 'signup' ? 'إنشاء حساب' : 'دخول'}
        </Button>

        <p className="text-center text-xs text-muted">
          أول مستخدم يُسجَّل يصبح أدمن تلقائيًا.
        </p>

        <Link
          to="/"
          className="flex items-center justify-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowRight size={14} /> العودة للرئيسية
        </Link>
      </form>
    </div>
  );
}
