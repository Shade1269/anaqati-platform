import { useEffect, useMemo, useState } from 'react';
import {
  Users2,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  Phone,
  Building2,
  Wallet,
  Target,
  Trophy,
} from 'lucide-react';
import { crmApi } from '../../lib/api';
import type { Lead, LeadStage, CrmDashboard } from '../../lib/types';
import {
  Button,
  Card,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  useToast,
} from '../../components/ui';
import { sar } from '../../lib/format';

const STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: 'new', label: 'جديد', tone: 'text-muted' },
  { key: 'contacted', label: 'تم التواصل', tone: 'text-info' },
  { key: 'qualified', label: 'مؤهّل', tone: 'text-primary-hover' },
  { key: 'proposal', label: 'عرض مقدّم', tone: 'text-gold' },
  { key: 'won', label: 'ربح', tone: 'text-success' },
  { key: 'lost', label: 'خسارة', tone: 'text-danger' },
];

const EMPTY = {
  id: null as string | null,
  name: '',
  phone: '',
  email: '',
  company: '',
  source: '',
  stage: 'new' as LeadStage,
  est_value: '',
  note: '',
};

export default function AdminCrm() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dash, setDash] = useState<CrmDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const [ls, d] = await Promise.all([
      crmApi.leadsList(),
      crmApi.dashboard().catch(() => null),
    ]);
    setLeads(ls);
    setDash(d);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byStage = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    STAGES.forEach((s) => (m[s.key] = []));
    leads.forEach((l) => (m[l.stage] ??= []).push(l));
    return m;
  }, [leads]);

  function openNew() {
    setForm(EMPTY);
    setDlg(true);
  }
  function openEdit(l: Lead) {
    setForm({
      id: l.id,
      name: l.name,
      phone: l.phone || '',
      email: l.email || '',
      company: l.company || '',
      source: l.source || '',
      stage: l.stage,
      est_value: String(l.est_value || ''),
      note: l.note || '',
    });
    setDlg(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error('الاسم مطلوب');
    setBusy(true);
    try {
      await crmApi.leadSet(
        form.id,
        form.name.trim(),
        form.phone.trim() || null,
        form.email.trim() || null,
        form.company.trim() || null,
        form.source.trim() || null,
        form.stage,
        Number(form.est_value) || 0,
        null,
        form.note.trim() || null
      );
      toast.success('تم الحفظ');
      setDlg(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(l: Lead, stage: string) {
    try {
      await crmApi.leadSetStage(l.id, stage);
      setLeads((cur) => cur.map((x) => (x.id === l.id ? { ...x, stage: stage as LeadStage } : x)));
      crmApi.dashboard().then(setDash).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function convertCustomer(l: Lead) {
    try {
      await crmApi.leadConvertCustomer(l.id);
      toast.success('تم تحويله إلى عميل');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(l: Lead) {
    if (!confirm(`حذف «${l.name}»؟`)) return;
    try {
      await crmApi.leadDelete(l.id);
      setLeads((cur) => cur.filter((x) => x.id !== l.id));
      crmApi.dashboard().then(setDash).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="العملاء المحتملون (CRM)"
        subtitle="مسار المبيعات — من عميل محتمل إلى صفقة"
        icon={<Users2 size={22} />}
        action={
          <Button icon={<Plus size={16} />} onClick={openNew}>
            عميل محتمل
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="عروض مفتوحة"
          value={dash?.open_quotes ?? 0}
          icon={<Target size={20} />}
          tone="info"
        />
        <StatCard
          label="قيمة العروض المفتوحة"
          value={sar(dash?.open_quotes_value ?? 0)}
          icon={<Wallet size={20} />}
          tone="gold"
        />
        <StatCard
          label="صفقات مربوحة (هذا الشهر)"
          value={dash?.won_this_month ?? 0}
          icon={<Trophy size={20} />}
          tone="success"
        />
        <StatCard
          label="محوّلة لأوامر بيع (هذا الشهر)"
          value={sar(dash?.converted_this_month ?? 0)}
          icon={<Wallet size={20} />}
          tone="success"
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((s) => {
          const items = byStage[s.key] || [];
          const val = items.reduce((a, l) => a + (l.est_value || 0), 0);
          return (
            <div key={s.key} className="w-72 shrink-0">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`text-sm font-bold ${s.tone}`}>
                  {s.label} <span className="text-muted">({items.length})</span>
                </span>
                <span className="text-xs text-muted">{sar(val)}</span>
              </div>
              <div className="space-y-3">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 py-6 text-center text-xs text-muted">
                    لا يوجد
                  </div>
                )}
                {items.map((l) => (
                  <Card key={l.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-text">{l.name}</span>
                      {l.customer_id && (
                        <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">
                          عميل
                        </span>
                      )}
                    </div>
                    {l.company && (
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Building2 size={12} /> {l.company}
                      </div>
                    )}
                    {l.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Phone size={12} /> {l.phone}
                      </div>
                    )}
                    {l.est_value > 0 && (
                      <div className="text-sm font-bold text-gold">{sar(l.est_value)}</div>
                    )}
                    <Select
                      value={l.stage}
                      onChange={(e) => moveStage(l, e.target.value)}
                      className="w-full text-xs"
                    >
                      {STAGES.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.label}
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-center gap-1 border-t border-white/5 pt-2">
                      <button
                        onClick={() => openEdit(l)}
                        className="rounded p-1.5 text-muted transition hover:bg-white/10 hover:text-text"
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                      {!l.customer_id && (
                        <button
                          onClick={() => convertCustomer(l)}
                          className="rounded p-1.5 text-success transition hover:bg-success/10"
                          title="تحويل إلى عميل"
                        >
                          <UserCheck size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => del(l)}
                        className="mr-auto rounded p-1.5 text-danger transition hover:bg-danger/10"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={dlg}
        onClose={() => setDlg(false)}
        title={form.id ? 'تعديل عميل محتمل' : 'عميل محتمل جديد'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDlg(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={save}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="الشركة">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <Field label="الجوال">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="البريد">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="المصدر">
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="إحالة / إعلان / زيارة"
            />
          </Field>
          <Field label="القيمة المتوقعة">
            <Input
              type="number"
              value={form.est_value}
              onChange={(e) => setForm({ ...form, est_value: e.target.value })}
            />
          </Field>
          <Field label="المرحلة">
            <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as LeadStage })}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ملاحظة">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
