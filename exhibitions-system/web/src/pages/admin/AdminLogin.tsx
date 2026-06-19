import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { ErrorBox, SuccessBox } from '../../components/ui';

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
        // If email confirmation is required there will be no active session.
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
      navigate('/admin/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-indigo-50 px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">دخول الإدارة</h1>
          <p className="mt-1 text-sm text-slate-500">
            للأدمن ومدير المخزون
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-2 font-medium ${
              mode === 'login' ? 'bg-white shadow' : 'text-slate-500'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-md py-2 font-medium ${
              mode === 'signup' ? 'bg-white shadow' : 'text-slate-500'
            }`}
          >
            حساب جديد
          </button>
        </div>

        <ErrorBox message={error} />
        <SuccessBox message={info} />

        {mode === 'signup' && (
          <div>
            <label className="label">الاسم الكامل</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <label className="label">البريد الإلكتروني</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">كلمة المرور</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <button className="btn-primary w-full" disabled={loading}>
          {loading
            ? 'جارٍ المعالجة...'
            : mode === 'signup'
            ? 'إنشاء حساب'
            : 'دخول'}
        </button>

        <p className="text-center text-xs text-slate-400">
          أول مستخدم يُسجَّل يصبح أدمن تلقائيًا.
        </p>

        <Link
          to="/"
          className="block text-center text-sm text-slate-500 hover:underline"
        >
          ← العودة للرئيسية
        </Link>
      </form>
    </div>
  );
}
