import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import { Button, Field, Input, ErrorBanner } from '../../components/ui';

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
      navigate(s.business_type === 'restaurant' ? '/employee/restaurant' : '/employee/dashboard');
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
            <UserRound size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-text">دخول الموظف</h1>
          <p className="mt-1 text-sm text-muted">ادخل برقم الجوال وكود الوصول</p>
        </div>

        <ErrorBanner message={error} />

        <Field label="رقم الجوال">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
            required
          />
        </Field>
        <Field label="كود الوصول">
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </Field>

        <Button type="submit" loading={loading} className="w-full">
          دخول
        </Button>

        <p className="text-center text-xs text-muted">
          ادخل برقم جوالك وكود الوصول الذي زوّدك به مكان عملك.
        </p>
      </form>
    </div>
  );
}
