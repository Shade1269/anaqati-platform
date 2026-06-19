import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { ErrorBox } from '../../components/ui';

export default function EmployeeLogin() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSession } = useEmployeeAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const s = await employeeApi.login(phone.trim(), code.trim());
      setSession(s);
      navigate('/employee/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">دخول الموظف</h1>
          <p className="mt-1 text-sm text-slate-500">
            ادخل برقم الجوال وكود الوصول
          </p>
        </div>

        <ErrorBox message={error} />

        <div>
          <label className="label">رقم الجوال</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
            required
          />
        </div>
        <div>
          <label className="label">كود الوصول</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>

        <button className="btn-emerald w-full" disabled={loading}>
          {loading ? 'جارٍ الدخول...' : 'دخول'}
        </button>

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
