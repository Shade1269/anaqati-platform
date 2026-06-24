import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Spinner } from '../../components/ui';

/** Guards the platform-owner panel. Only `is_platform_admin` users may enter. */
export default function RequirePlatform({ children }: { children: ReactNode }) {
  const { loading, authed, profile } = useAdminAuth();

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!authed || !profile) return <Navigate to="/owner" replace />;

  if (!profile.is_platform_admin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-bold text-text">لا تملك صلاحية الوصول</h1>
        <p className="max-w-sm text-sm text-muted">
          لوحة المنصة متاحة لمالك المنصة فقط.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
