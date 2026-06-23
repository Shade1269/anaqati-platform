import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Phone, ChevronLeft } from 'lucide-react';
import { adminApi } from '../../lib/api';
import type { EmployeeListRow } from '../../lib/types';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../../components/ui';

export default function AdminMonitoring() {
  const [employees, setEmployees] = useState<EmployeeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    adminApi
      .listEmployees()
      .then(setEmployees)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="مراقبة الموظفين"
        subtitle="متابعة المبيعات والعهدة والكاش المستحق لكل موظف"
        icon={<UserCheck size={22} />}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : employees.length === 0 ? (
        <EmptyState message="لا يوجد موظفون" icon={<UserCheck size={26} />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => (
            <button
              key={e.id}
              onClick={() => navigate(`/admin/monitoring/${e.id}`)}
              className="ax-card group flex items-center justify-between gap-3 p-5 text-right transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
                  <UserCheck size={20} />
                </div>
                <div>
                  <p className="font-bold text-text">{e.full_name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <Phone size={12} />
                    {e.phone || '—'}
                  </p>
                  <div className="mt-1.5">
                    <StatusBadge status={e.status || undefined} />
                  </div>
                </div>
              </div>
              <ChevronLeft
                size={18}
                className="text-muted transition group-hover:text-gold"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
