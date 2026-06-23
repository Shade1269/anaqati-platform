import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, UserRound } from 'lucide-react';

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-info/10 blur-3xl" />

      <div className="relative w-full max-w-4xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-3xl font-extrabold text-primary-hover">
          ⬩
        </div>
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-gold">
          Black Axis
        </p>
        <h1 className="text-4xl font-extrabold text-text sm:text-5xl">
          نظام إدارة المعارض والمخزون
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          منصة متكاملة لإدارة البضاعة من المورّدين إلى المستودعات إلى المعارض
          المؤقتة، والبيع عبر الموظفين المتنقّلين.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <EntryCard
            to="/admin/login"
            icon={<Building2 size={26} />}
            title="دخول الإدارة"
            desc="الأدمن ومدير المخزون — دخول بالبريد وكلمة المرور"
          />
          <EntryCard
            to="/employee/login"
            icon={<UserRound size={26} />}
            title="دخول الموظف"
            desc="تسجيل دخول برقم الجوال وكود الوصول"
          />
        </div>
      </div>
    </div>
  );
}

function EntryCard({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="ax-card group p-8 text-right transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary-hover transition group-hover:bg-primary/25">
        {icon}
      </div>
      <h2 className="mt-5 text-xl font-bold text-text">{title}</h2>
      <p className="mt-2 text-sm text-muted">{desc}</p>
      <span className="mt-5 inline-flex items-center gap-2 font-bold text-gold">
        ادخل
        <ArrowLeft size={16} className="transition group-hover:-translate-x-1" />
      </span>
    </Link>
  );
}
