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
  Megaphone,
  Clapperboard,
  Palette,
  PenTool,
  Share2,
  Camera,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  صفحة تعريفية عامة بالنظام المحاسبي — مفتوحة للجميع (بدون تسجيل دخول) */
/* ------------------------------------------------------------------ */

interface ModuleCard {
  title: string;
  desc: string;
  icon: React.ReactNode;
  tone: string;
}

const modules: ModuleCard[] = [
  {
    title: 'النظرة المالية / الصندوق',
    desc: 'ملخّص لحظي للخزينة نقدًا وشبكة، قيمة المخزون، والمستحقات على الموظفين والموردين.',
    icon: <Calculator size={22} />,
    tone: 'primary',
  },
  {
    title: 'قائمة الدخل',
    desc: 'الإيرادات مقابل المصروفات لتحديد صافي الربح أو الخسارة خلال فترة محددة.',
    icon: <TrendingUp size={22} />,
    tone: 'success',
  },
  {
    title: 'الميزانية العمومية',
    desc: 'الأصول = الخصوم + حقوق الملكية في لحظة معيّنة، لقياس المركز المالي للمنشأة.',
    icon: <Scale size={22} />,
    tone: 'info',
  },
  {
    title: 'ميزان المراجعة',
    desc: 'إجمالي المدين والدائن لكل الحسابات للتأكد من توازن القيود قبل إصدار القوائم.',
    icon: <ListChecks size={22} />,
    tone: 'warning',
  },
  {
    title: 'دفتر الأستاذ',
    desc: 'حركة كل حساب على حدة بالتفصيل مع الرصيد المتجمّع بعد كل عملية.',
    icon: <BookOpen size={22} />,
    tone: 'primary',
  },
  {
    title: 'القيود اليومية',
    desc: 'سجل القيود المزدوجة (مدين/دائن) لكل عملية مالية بترتيبها الزمني.',
    icon: <NotebookPen size={22} />,
    tone: 'info',
  },
  {
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

const mediaServices: { icon: React.ReactNode; title: string; desc: string; tone: string }[] = [
  {
    icon: <Share2 size={22} />,
    title: 'إدارة وسائل التواصل',
    desc: 'إدارة حسابات السوشيال ميديا، جدولة المنشورات، والتفاعل مع الجمهور بهوية موحّدة.',
    tone: 'info',
  },
  {
    icon: <Megaphone size={22} />,
    title: 'الحملات الإعلانية',
    desc: 'تخطيط وإطلاق إعلانات ممولة على المنصات المختلفة مع استهداف دقيق وقياس النتائج.',
    tone: 'primary',
  },
  {
    icon: <Clapperboard size={22} />,
    title: 'تصميم وإنتاج الفيديوهات',
    desc: 'مونتاج، موشن جرافيك، وفيديوهات ترويجية احترافية تبرز منتجاتك وخدماتك.',
    tone: 'success',
  },
  {
    icon: <Palette size={22} />,
    title: 'التصاميم الجرافيكية',
    desc: 'تصاميم سوشيال ميديا، بوسترات، ومواد دعائية بجودة عالية تعكس هوية علامتك.',
    tone: 'warning',
  },
  {
    icon: <PenTool size={22} />,
    title: 'الهوية البصرية',
    desc: 'بناء هوية متكاملة من الشعار والألوان والخطوط لتمييز علامتك التجارية.',
    tone: 'info',
  },
  {
    icon: <Camera size={22} />,
    title: 'التصوير الاحترافي',
    desc: 'تصوير المنتجات والفعاليات بزوايا وإضاءة تبرز التفاصيل وترفع قيمة المحتوى.',
    tone: 'primary',
  },
];

const tones: Record<string, string> = {
  primary: 'bg-primary/15 text-primary-hover',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
};

export default function AccountingLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-info/10 blur-3xl" />

      {/* ---------- Top bar ---------- */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xl font-extrabold text-primary-hover">
            ⬩
          </div>
          <span className="text-lg font-extrabold text-text">النظام المحاسبي</span>
        </div>
        <Link to="/admin/login" className="ax-btn ax-btn-primary">
          دخول النظام
          <ArrowLeft size={16} />
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-14 px-5 pb-20">
        {/* ---------- Hero ---------- */}
        <section className="pt-8 text-center sm:pt-14">
          <span className="ax-badge mx-auto bg-primary/15 text-primary-hover">
            <Sparkles size={14} />
            محاسبة القيد المزدوج
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-snug text-text sm:text-5xl">
            نظام محاسبي متكامل يحوّل عمليات منشأتك إلى قوائم مالية دقيقة
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            مبنيّ على مبدأ القيد المزدوج، ومرتبط مباشرةً بالمبيعات والمخزون
            والموردين والعملاء. كل عملية تُسجَّل آليًا في القيود اليومية، ثم
            تُرحَّل إلى دفتر الأستاذ، لتحصل في أي لحظة على ميزان مراجعة متوازن
            وقوائم مالية جاهزة — دون أي إدخال محاسبي يدوي.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/admin/login" className="ax-btn ax-btn-primary">
              <Calculator size={16} />
              ابدأ الآن
            </Link>
            <a href="#modules" className="ax-btn ax-btn-outline">
              تعرّف على الوحدات
            </a>
          </div>
        </section>

        {/* ---------- Modules ---------- */}
        <section id="modules">
          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-text sm:text-3xl">
              وحدات النظام المحاسبي
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-muted">
              سبع وحدات متكاملة تغطّي الدورة المحاسبية بالكامل من القيد حتى
              القوائم الختامية.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div key={m.title} className="ax-card p-5">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[m.tone]}`}
                >
                  {m.icon}
                </div>
                <h3 className="mt-4 text-base font-bold text-text">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section>
          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-text sm:text-3xl">
              لماذا هذا النظام؟
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="ax-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-hover">
                    {f.icon}
                  </div>
                  <h3 className="text-base font-bold text-text">{f.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Accounting cycle ---------- */}
        <section className="ax-card p-6 sm:p-8">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">
            الدورة المحاسبية
          </h2>
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
                <span className="pt-0.5 text-sm font-medium text-text">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Standards / guarantees ---------- */}
        <section className="ax-card p-6 sm:p-8">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">
            ضمانات ومعايير
          </h2>
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

        {/* ---------- Media & advertising department ---------- */}
        <section>
          <div className="text-center">
            <span className="ax-badge mx-auto bg-info/15 text-info">
              <Megaphone size={14} />
              قسم متكامل
            </span>
            <h2 className="mt-4 text-2xl font-extrabold text-text sm:text-3xl">
              قسم الميديا والإعلانات
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-muted">
              إلى جانب المحاسبة، نوفّر قسمًا مختصًّا بالميديا والإعلانات وتصميم
              الفيديوهات والتصاميم — لإبراز علامتك التجارية والوصول إلى عملائك
              بأسلوب احترافي.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mediaServices.map((s) => (
              <div key={s.title} className="ax-card p-5">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[s.tone]}`}
                >
                  {s.icon}
                </div>
                <h3 className="mt-4 text-base font-bold text-text">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="ax-card relative overflow-hidden p-8 text-center sm:p-10">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-extrabold text-text sm:text-3xl">
              جاهز لإدارة محاسبتك باحترافية؟
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              ادخل إلى النظام وابدأ بمتابعة قوائمك المالية لحظيًا.
            </p>
            <Link
              to="/admin/login"
              className="ax-btn ax-btn-primary mx-auto mt-6"
            >
              <Calculator size={16} />
              الدخول إلى النظام المحاسبي
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} النظام المحاسبي — جميع الحقوق محفوظة
      </footer>
    </div>
  );
}
