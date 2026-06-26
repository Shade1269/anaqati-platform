import { Link } from 'react-router-dom';
import {
  Calculator,
  TrendingUp,
  Scale,
  ListChecks,
  BookOpen,
  NotebookPen,
  Waves,
  Lock,
  ShieldCheck,
  Repeat2,
  Layers,
  FileSpreadsheet,
  Banknote,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui';

/* ------------------------------------------------------------------ */
/*  صفحة تعريفية كاملة بالنظام المحاسبي                                  */
/*  تشرح وحدات المحاسبة، دورة العمل، والمزايا، مع روابط مباشرة لكل وحدة   */
/* ------------------------------------------------------------------ */

interface ModuleCard {
  to: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tone: string; // tailwind color token name
}

const modules: ModuleCard[] = [
  {
    to: '/admin/accounting',
    title: 'النظرة المالية / الصندوق',
    desc: 'ملخّص لحظي للخزينة نقدًا وشبكة، قيمة المخزون، والمستحقات على الموظفين والموردين.',
    icon: <Calculator size={22} />,
    tone: 'primary',
  },
  {
    to: '/admin/accounting/income',
    title: 'قائمة الدخل',
    desc: 'الإيرادات مقابل المصروفات لتحديد صافي الربح أو الخسارة خلال فترة محددة.',
    icon: <TrendingUp size={22} />,
    tone: 'success',
  },
  {
    to: '/admin/accounting/balance',
    title: 'الميزانية العمومية',
    desc: 'الأصول = الخصوم + حقوق الملكية في لحظة معيّنة، لقياس المركز المالي للمنشأة.',
    icon: <Scale size={22} />,
    tone: 'info',
  },
  {
    to: '/admin/accounting/trial-balance',
    title: 'ميزان المراجعة',
    desc: 'إجمالي المدين والدائن لكل الحسابات للتأكد من توازن القيود قبل إصدار القوائم.',
    icon: <ListChecks size={22} />,
    tone: 'warning',
  },
  {
    to: '/admin/accounting/ledger',
    title: 'دفتر الأستاذ',
    desc: 'حركة كل حساب على حدة بالتفصيل مع الرصيد المتجمّع بعد كل عملية.',
    icon: <BookOpen size={22} />,
    tone: 'primary',
  },
  {
    to: '/admin/accounting/journal',
    title: 'القيود اليومية',
    desc: 'سجل القيود المزدوجة (مدين/دائن) لكل عملية مالية بترتيبها الزمني.',
    icon: <NotebookPen size={22} />,
    tone: 'info',
  },
  {
    to: '/admin/accounting/cashflow',
    title: 'قائمة التدفق النقدي',
    desc: 'حركة النقد الداخل والخارج من الأنشطة التشغيلية والاستثمارية والتمويلية.',
    icon: <Waves size={22} />,
    tone: 'success',
  },
];

const features: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <Repeat2 size={20} />,
    title: 'قيد مزدوج تلقائي',
    desc: 'كل عملية بيع أو شراء أو تحصيل تُولّد قيدها المحاسبي المتوازن آليًا دون إدخال يدوي.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'دقة وتوازن مضمون',
    desc: 'النظام يضمن دائمًا تساوي المدين والدائن، ويمنع ترحيل أي قيد غير متوازن.',
  },
  {
    icon: <Lock size={20} />,
    title: 'إقفال الفترة',
    desc: 'ترحيل صافي الربح إلى الأرباح المحتجزة وإقفال الحسابات المؤقتة بنقرة واحدة.',
  },
  {
    icon: <Layers size={20} />,
    title: 'متكامل مع التشغيل',
    desc: 'مرتبط مباشرة بالمبيعات والمخزون والموردين والعملاء، فالأرقام حقيقية ولحظية.',
  },
  {
    icon: <FileSpreadsheet size={20} />,
    title: 'قوائم مالية جاهزة',
    desc: 'قائمة دخل، ميزانية عمومية، وتدفق نقدي تُصدَر فورًا لأي فترة تختارها.',
  },
  {
    icon: <Banknote size={20} />,
    title: 'متابعة الخزينة',
    desc: 'رصيد نقدي وشبكة محدّث لحظيًا مع تتبّع المستحقات والمدفوعات.',
  },
];

const cycle: string[] = [
  'العملية المالية (بيع / شراء / تحصيل)',
  'تسجيل القيد في دفتر اليومية',
  'الترحيل إلى دفتر الأستاذ',
  'إعداد ميزان المراجعة',
  'إصدار القوائم المالية',
  'إقفال الفترة',
];

const tones: Record<string, string> = {
  primary: 'bg-primary/15 text-primary-hover',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
};

export default function AccountingAbout() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="النظام المحاسبي"
        subtitle="نظرة تعريفية شاملة بوحدات المحاسبة وكيفية عملها"
        icon={<Calculator size={22} />}
      />

      {/* ---------- Hero ---------- */}
      <section className="ax-card relative overflow-hidden p-8 sm:p-10">
        <div className="pointer-events-none absolute -top-24 left-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-info/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="ax-badge bg-primary/15 text-primary-hover">
            <Sparkles size={14} />
            محاسبة القيد المزدوج
          </span>
          <h2 className="mt-4 text-3xl font-extrabold leading-snug text-text sm:text-4xl">
            نظام محاسبي متكامل يحوّل عمليات منشأتك إلى قوائم مالية دقيقة
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            وحدة المحاسبة مبنية على مبدأ القيد المزدوج، ومرتبطة مباشرةً بالمبيعات
            والمخزون والموردين والعملاء. كل عملية تُسجَّل آليًا في القيود اليومية،
            ثم تُرحَّل إلى دفتر الأستاذ، لتحصل في أي لحظة على ميزان مراجعة متوازن
            وقوائم مالية جاهزة — دون أي إدخال محاسبي يدوي.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/admin/accounting" className="ax-btn ax-btn-primary">
              <Calculator size={16} />
              ابدأ من النظرة المالية
            </Link>
            <Link
              to="/admin/accounting/journal"
              className="ax-btn ax-btn-outline"
            >
              <NotebookPen size={16} />
              استعراض القيود اليومية
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Modules ---------- */}
      <section>
        <h3 className="mb-4 text-lg font-bold text-text">وحدات النظام المحاسبي</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="ax-card group p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[m.tone]}`}
              >
                {m.icon}
              </div>
              <h4 className="mt-4 text-base font-bold text-text">{m.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-gold">
                فتح الوحدة
                <ArrowLeft
                  size={15}
                  className="transition group-hover:-translate-x-1"
                />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section>
        <h3 className="mb-4 text-lg font-bold text-text">لماذا هذا النظام؟</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="ax-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-hover">
                  {f.icon}
                </div>
                <h4 className="text-base font-bold text-text">{f.title}</h4>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Accounting cycle ---------- */}
      <section className="ax-card p-6 sm:p-8">
        <h3 className="text-lg font-bold text-text">الدورة المحاسبية</h3>
        <p className="mt-1 text-sm text-muted">
          رحلة كل عملية مالية داخل النظام من لحظة حدوثها حتى إصدار القوائم.
        </p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cycle.map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary-hover">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm font-medium text-text">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Standards / guarantees ---------- */}
      <section className="ax-card p-6 sm:p-8">
        <h3 className="text-lg font-bold text-text">ضمانات ومعايير</h3>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            'الالتزام بمبدأ القيد المزدوج في كل العمليات',
            'توازن دائم بين إجمالي المدين وإجمالي الدائن',
            'أرقام لحظية مستمدّة من بيانات التشغيل الحقيقية',
            'فصل واضح بين الحسابات الدائمة والمؤقتة عند الإقفال',
            'إقفال آمن للفترات مع ترحيل الأرباح المحتجزة',
            'قوائم مالية قابلة للإصدار لأي فترة زمنية',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0 text-success"
              />
              <span className="text-sm leading-relaxed text-text">{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
