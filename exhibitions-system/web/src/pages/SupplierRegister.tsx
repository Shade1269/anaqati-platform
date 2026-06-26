import { useState } from 'react';
import {
  Store,
  Phone,
  Briefcase,
  MapPin,
  User,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Users,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { publicApi } from '../lib/api';

/* ------------------------------------------------------------------ */
/*  صفحة هبوط عامة لتسجيل الموردين — مخصّصة للحملات الإعلانية (بدون دخول) */
/* ------------------------------------------------------------------ */

const benefits: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <TrendingUp size={22} />,
    title: 'وصول أوسع لمنتجاتك',
    desc: 'اعرض منتجاتك أمام آلاف العملاء عبر متاجر ومعارض المنصة.',
  },
  {
    icon: <Users size={22} />,
    title: 'شبكة مسوّقين جاهزة',
    desc: 'مسوّقون ومتاجر يبيعون منتجاتك مقابل عمولة، بدون جهد تسويقي منك.',
  },
  {
    icon: <ShieldCheck size={22} />,
    title: 'تحصيل ومدفوعات آمنة',
    desc: 'نتكفّل بالطلبات والتحصيل، ويصلك مستحقّك بشفافية ووضوح.',
  },
];

// 05XXXXXXXX | 5XXXXXXXX | +9665XXXXXXXX | 9665XXXXXXXX
function isValidSaudiPhone(raw: string): boolean {
  const d = raw.replace(/[^0-9]/g, '');
  return /^9665\d{8}$/.test(d) || /^5\d{8}$/.test(d) || /^05\d{8}$/.test(d);
}

export default function SupplierRegister() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [activity, setActivity] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isValidSaudiPhone(phone)) {
      setError('فضلاً أدخل رقم جوال سعودي صحيح (مثال: 05XXXXXXXX).');
      return;
    }
    if (!activity.trim()) {
      setError('فضلاً اكتب نشاطك التجاري.');
      return;
    }

    setBusy(true);
    try {
      await publicApi.registerSupplier({
        name: name.trim(),
        phone: phone.trim(),
        activity: activity.trim(),
        city: city.trim(),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message || 'تعذّر إرسال الطلب، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-info/10 blur-3xl" />

      {/* ---------- Top bar ---------- */}
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xl font-extrabold text-primary-hover">
            ⬩
          </div>
          <span className="text-lg font-extrabold text-text">أناقتي</span>
        </div>
        <span className="ax-badge bg-primary/15 text-primary-hover">
          <Sparkles size={14} />
          انضم كمورّد
        </span>
      </header>

      <main className="relative z-10 mx-auto grid max-w-5xl gap-10 px-5 pb-20 pt-6 lg:grid-cols-2 lg:items-start lg:gap-12">
        {/* ---------- Right: pitch ---------- */}
        <section className="order-2 lg:order-1 lg:pt-6">
          <h1 className="max-w-xl text-3xl font-extrabold leading-snug text-text sm:text-4xl">
            سجّل منتجاتك معنا… ووصّلها لآلاف العملاء
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            نبحث عن موردين ومصنّعين وأصحاب منتجات للانضمام لمنصة أناقتي. اترك رقم
            جوالك ونوع نشاطك، وفريقنا يتواصل معك خلال وقت قصير لشرح التفاصيل.
          </p>

          <div className="mt-8 grid gap-4">
            {benefits.map((b) => (
              <div key={b.title} className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
                  {b.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">{b.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Left: form / success ---------- */}
        <section className="order-1 lg:order-2">
          <div className="ax-card p-6 sm:p-8">
            {done ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 size={34} />
                </div>
                <h2 className="mt-5 text-2xl font-extrabold text-text">
                  تم استلام طلبك!
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                  شكراً لتسجيلك. سيتواصل معك فريق أناقتي على الرقم الذي أدخلته في
                  أقرب وقت. ابقَ على استعداد 🌟
                </p>
                <button
                  type="button"
                  className="ax-btn ax-btn-outline mt-6 mx-auto"
                  onClick={() => {
                    setDone(false);
                    setName('');
                    setPhone('');
                    setActivity('');
                    setCity('');
                  }}
                >
                  تسجيل مورّد آخر
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-hover">
                    <Store size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-text">
                      تسجيل مورّد جديد
                    </h2>
                    <p className="text-sm text-muted">دقيقة واحدة وتخلص ✨</p>
                  </div>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div>
                    <label className="ax-label">
                      <span className="inline-flex items-center gap-1.5">
                        <User size={14} /> الاسم
                        <span className="text-muted">(اختياري)</span>
                      </span>
                    </label>
                    <input
                      className="ax-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="اسمك أو اسم المتجر"
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label className="ax-label">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone size={14} /> رقم الجوال
                        <span className="text-danger">*</span>
                      </span>
                    </label>
                    <input
                      className="ax-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      required
                    />
                  </div>

                  <div>
                    <label className="ax-label">
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase size={14} /> النشاط التجاري
                        <span className="text-danger">*</span>
                      </span>
                    </label>
                    <input
                      className="ax-input"
                      value={activity}
                      onChange={(e) => setActivity(e.target.value)}
                      placeholder="مثال: عطور وبخور، أزياء، إكسسوارات…"
                      required
                    />
                  </div>

                  <div>
                    <label className="ax-label">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={14} /> المدينة
                        <span className="text-muted">(اختياري)</span>
                      </span>
                    </label>
                    <input
                      className="ax-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="مدينتك"
                      autoComplete="address-level2"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="ax-btn ax-btn-primary w-full justify-center"
                    disabled={busy}
                  >
                    {busy ? (
                      'جارٍ الإرسال…'
                    ) : (
                      <>
                        <Send size={16} />
                        أرسل طلب الانضمام
                      </>
                    )}
                  </button>

                  <p className="text-center text-xs leading-relaxed text-muted">
                    بإرسالك الطلب فإنك توافق على تواصل فريق أناقتي معك بخصوص
                    الانضمام.
                  </p>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
