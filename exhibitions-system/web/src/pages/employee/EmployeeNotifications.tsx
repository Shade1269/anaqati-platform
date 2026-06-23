import { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import type { NotificationRow } from '../../lib/types';
import {
  Button,
  Card,
  ErrorBanner,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { NotificationsPanel } from '../../components/shell/NotificationsPanel';

export default function EmployeeNotifications() {
  const { session } = useEmployeeAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const data = await employeeApi.notifications(session.token);
      setItems(data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    if (!session) return;
    try {
      await employeeApi.markRead(session.token, id);
    } catch {
      /* ignore */
    }
    setItems((s) => s.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  return (
    <div>
      <PageHeader
        title="الإشعارات"
        subtitle="آخر التحديثات الخاصة بك"
        icon={<Bell size={22} />}
        action={
          <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={load}>
            تحديث
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner />
      ) : (
        <Card>
          <NotificationsPanel loading={false} items={items} onMarkRead={markRead} />
        </Card>
      )}
    </div>
  );
}
