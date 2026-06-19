import { useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AuditRow } from '../../lib/types';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
  Table,
  Badge,
} from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

interface Row extends AuditRow {
  actor?: { full_name: string } | null;
}

export default function AdminAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { data, error: e } = await supabase
      .from('audit_log')
      .select('id,action,entity,entity_id,actor_id,created_at,actor:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (e) setError(e.message);
    else setRows((data as unknown as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.action?.toLowerCase().includes(q) ||
        r.entity?.toLowerCase().includes(q) ||
        r.actor?.full_name?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div>
      <PageHeader
        title="سجل العمليات"
        subtitle="جميع الإجراءات المسجَّلة في النظام"
        icon={<ScrollText size={22} />}
        action={
          <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={load}>
            تحديث
          </Button>
        }
      />
      <ErrorBanner message={error} />

      <div className="relative mb-4 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          className="pr-9"
          placeholder="ابحث في السجل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="لا توجد سجلات" icon={<ScrollText size={26} />} />
      ) : (
        <Table
          head={
            <>
              <th>الوقت</th>
              <th>الإجراء</th>
              <th>الكيان</th>
              <th>المنفّذ</th>
            </>
          }
        >
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className="text-muted">{fmtDateTime(r.created_at)}</td>
              <td>
                <Badge tone="gold">{r.action}</Badge>
              </td>
              <td className="text-muted">{r.entity || '—'}</td>
              <td className="font-semibold">{r.actor?.full_name || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
