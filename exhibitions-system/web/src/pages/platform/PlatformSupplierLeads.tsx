import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Download, Search } from 'lucide-react';
import { platformApi } from '../../lib/api';
import type {
  SupplierRegistration,
  SupplierRegistrationStatus,
} from '../../lib/types';
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  useToast,
} from '../../components/ui';

const STATUS: Record<
  SupplierRegistrationStatus,
  { label: string; tone: 'info' | 'warning' | 'success' | 'danger' }
> = {
  new: { label: 'جديد', tone: 'info' },
  contacted: { label: 'تم التواصل', tone: 'warning' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function PlatformSupplierLeads() {
  const [rows, setRows] = useState<SupplierRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SupplierRegistrationStatus>(
    'all'
  );
  const toast = useToast();

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await platformApi.supplierRegistrations());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.activity.toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: rows.length, new: 0, contacted: 0, approved: 0 };
    for (const r of rows) {
      if (r.status === 'new') c.new++;
      else if (r.status === 'contacted') c.contacted++;
      else if (r.status === 'approved') c.approved++;
    }
    return c;
  }, [rows]);

  async function changeStatus(
    id: string,
    status: SupplierRegistrationStatus
  ) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await platformApi.setSupplierRegistrationStatus(id, status);
    } catch (e) {
      setRows(prev); // rollback
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const header = ['الاسم', 'الجوال', 'النشاط', 'المدينة', 'الحالة', 'التاريخ'];
    const lines = filtered.map((r) =>
      [
        r.name || '',
        r.phone,
        r.activity,
        r.city || '',
        STATUS[r.status].label,
        fmtDate(r.created_at),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="طلبات الموردين"
        subtitle="الموردون المسجّلون عبر حملة الانضمام"
        icon={<UserPlus size={22} />}
        action={
          rows.length > 0 ? (
            <button className="ax-btn ax-btn-outline" onClick={exportCsv}>
              <Download size={16} />
              تصدير CSV
            </button>
          ) : null
        }
      />

      <ErrorBanner message={error} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الإجمالي" value={String(counts.total)} tone="gold" />
        <StatCard label="جديد" value={String(counts.new)} tone="info" />
        <StatCard
          label="تم التواصل"
          value={String(counts.contacted)}
          tone="warning"
        />
        <StatCard label="معتمد" value={String(counts.approved)} tone="success" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            className="pr-9"
            placeholder="ابحث بالاسم أو الجوال أو النشاط…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          className="w-auto"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'all' | SupplierRegistrationStatus)
          }
        >
          <option value="all">كل الحالات</option>
          <option value="new">جديد</option>
          <option value="contacted">تم التواصل</option>
          <option value="approved">معتمد</option>
          <option value="rejected">مرفوض</option>
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            rows.length === 0
              ? 'لا توجد طلبات تسجيل بعد'
              : 'لا توجد نتائج مطابقة للبحث'
          }
          icon={<UserPlus size={26} />}
        />
      ) : (
        <Table
          head={
            <>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>النشاط</th>
              <th>المدينة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>تغيير الحالة</th>
            </>
          }
        >
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.name || '—'}</td>
              <td dir="ltr" className="text-start">
                <a className="text-primary-hover" href={`tel:${r.phone}`}>
                  {r.phone}
                </a>
              </td>
              <td>{r.activity}</td>
              <td className="text-muted">{r.city || '—'}</td>
              <td className="text-muted">{fmtDate(r.created_at)}</td>
              <td>
                <Badge tone={STATUS[r.status].tone}>
                  {STATUS[r.status].label}
                </Badge>
              </td>
              <td>
                <Select
                  className="w-auto"
                  value={r.status}
                  onChange={(e) =>
                    changeStatus(
                      r.id,
                      e.target.value as SupplierRegistrationStatus
                    )
                  }
                >
                  <option value="new">جديد</option>
                  <option value="contacted">تم التواصل</option>
                  <option value="approved">معتمد</option>
                  <option value="rejected">مرفوض</option>
                </Select>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
