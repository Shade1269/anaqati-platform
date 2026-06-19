import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-4xl font-extrabold text-slate-800">
          نظام إدارة المعارض والمخزون
        </h1>
        <p className="mt-3 text-slate-500">
          إدارة البضاعة من الموردين إلى المستودعات إلى المعارض المؤقتة والبيع
          عبر الموظفين المتنقّلين
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Link
            to="/admin/login"
            className="group rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl">
              🏢
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-800">
              دخول الإدارة
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              الأدمن ومدير المخزون — تسجيل دخول بالبريد وكلمة المرور
            </p>
            <span className="mt-4 inline-block font-semibold text-indigo-600 group-hover:underline">
              ادخل ←
            </span>
          </Link>

          <Link
            to="/employee/login"
            className="group rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
              🧑‍💼
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-800">
              دخول الموظف
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              تسجيل دخول برقم الجوال وكود الوصول
            </p>
            <span className="mt-4 inline-block font-semibold text-emerald-600 group-hover:underline">
              ادخل ←
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
