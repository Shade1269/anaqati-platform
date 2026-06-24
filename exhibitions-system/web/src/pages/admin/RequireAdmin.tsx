import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Spinner } from '../../components/ui';

/**
 * Wraps admin-only routes. Non-admins (e.g. inventory_manager) are redirected
 * to an allowed operations page instead of seeing the page render.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, profile } = useAdminAuth();

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!profile) return <Navigate to="/admin/login" replace />;

  // مالك المنصة لا يدخل أنظمة العملاء — يُحوّل للوحة المنصة.
  if (profile.is_platform_admin) return <Navigate to="/platform" replace />;

  if (profile.role !== 'admin') {
    if (profile.role === 'inventory_manager') {
      return <Navigate to="/admin/inventory" replace />;
    }
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-bold text-text">لا تملك صلاحية الوصول</h1>
        <p className="max-w-sm text-sm text-muted">
          هذه الصفحة متاحة للأدمن فقط.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
