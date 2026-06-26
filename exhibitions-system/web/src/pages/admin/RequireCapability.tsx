import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Spinner } from '../../components/ui';
import type { Permissions } from '../../lib/types';

/**
 * Capability-based guard for delegated (manager) routes.
 *
 * Allows access when:
 *  - the user is the OWNER (role === 'admin'), OR
 *  - the user is a MANAGER (role === 'inventory_manager') AND at least one of
 *    the requested capabilities is enabled in their permission flags.
 *
 * Otherwise the user is redirected to the first page they CAN reach, or shown a
 * "no permission" screen when they have no delegated capabilities at all.
 */

export function hasCapability(
  perms: Permissions | null | undefined,
  caps: string[]
): boolean {
  if (!perms) return false;
  return caps.some((c) => !!perms[c]);
}

/** First route a manager can reach, given their permission flags. */
export function firstAllowedRoute(perms: Permissions | null | undefined): string | null {
  if (!perms) return null;
  if (perms.can_add_stock) return '/admin/receive-stock';
  if (perms.can_approve_requests) return '/admin/requests';
  if (perms.can_issue_wholesale) return '/admin/wholesale';
  // Inventory is readable by any manager.
  if (
    perms.can_add_stock ||
    perms.can_approve_requests ||
    perms.can_issue_transfers ||
    perms.can_transfers ||
    perms.can_issue_wholesale ||
    perms.can_receive_returns ||
    perms.can_returns
  ) {
    return '/admin/inventory';
  }
  if (perms.can_manage_restaurant) return '/admin/restaurant/pos';
  if (perms.can_manage_manufacturing) return '/admin/mfg/work-orders';
  if (perms.can_manage_market) return '/admin/market/browse';
  if (perms.can_manage_employees) return '/admin/team';
  if (perms.can_manage_store) return '/admin/store/orders';
  return null;
}

export default function RequireCapability({
  caps,
  children,
}: {
  caps: string[];
  children: ReactNode;
}) {
  const { loading, profile } = useAdminAuth();

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!profile) return <Navigate to="/admin/login" replace />;

  // مالك المنصة لا يدخل أنظمة العملاء — يُحوّل للوحة المنصة.
  if (profile.is_platform_admin) return <Navigate to="/platform" replace />;

  // Owner sees everything.
  if (profile.role === 'admin') return <>{children}</>;

  if (
    profile.role === 'inventory_manager' &&
    hasCapability(profile.permissions, caps)
  ) {
    return <>{children}</>;
  }

  // Manager without this capability → bounce to a page they can use.
  if (profile.role === 'inventory_manager') {
    const target = firstAllowedRoute(profile.permissions);
    if (target) return <Navigate to={target} replace />;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15 text-danger">
        <ShieldAlert size={28} />
      </div>
      <h1 className="text-xl font-bold text-text">لا تملك صلاحية</h1>
      <p className="max-w-sm text-sm text-muted">
        ليس لديك الصلاحية للوصول إلى هذه الصفحة. تواصل مع المالك.
      </p>
    </div>
  );
}
