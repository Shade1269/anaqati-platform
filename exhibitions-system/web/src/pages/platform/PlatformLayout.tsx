import { useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Building2, LogIn, UserPlus } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Spinner } from '../../components/ui';
import {
  DashboardShell,
  type NavSection,
} from '../../components/shell/DashboardShell';

const sz = 18;

export default function PlatformLayout() {
  const { loading, authed, profile, signOut } = useAdminAuth();
  const navigate = useNavigate();

  if (loading) return <Spinner label="جارٍ التحقق..." />;

  if (!authed || !profile) {
    navigate('/admin/login');
    return null;
  }

  const sections: NavSection[] = [
    {
      title: 'المنصة',
      items: [
        {
          to: '/platform',
          label: 'العملاء',
          icon: <Building2 size={sz} />,
          end: true,
        },
        {
          to: '/platform/supplier-leads',
          label: 'طلبات الموردين',
          icon: <UserPlus size={sz} />,
        },
      ],
    },
  ];

  return (
    <DashboardShell
      brand="لوحة المنصة"
      brandSub="إدارة العملاء (White-label)"
      sections={sections}
      userName={profile.full_name}
      roleLabel="مالك المنصة"
      roleTone="gold"
      onLogout={async () => {
        await signOut();
        navigate('/');
      }}
      topExtra={
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-muted transition hover:bg-white/10 hover:text-text"
        >
          <LogIn size={16} />
          <span className="hidden sm:inline">ادخل كأدمن لمؤسستي</span>
        </button>
      }
    >
      <Outlet />
    </DashboardShell>
  );
}
