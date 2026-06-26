import { test, expect } from '@playwright/test';
import { env, loginOwner, trackConsoleErrors } from './helpers';

test.describe('لوحة المالك (مطعم)', () => {
  test.skip(!env.ownerEmail || !env.ownerPassword, 'بيانات المالك غير مضبوطة (E2E_OWNER_EMAIL/PASSWORD)');

  test('تسجيل الدخول ولوحة التحكم تعرض بيانات المطعم', async ({ page }) => {
    const errs = trackConsoleErrors(page);
    await loginOwner(page);
    await page.goto('/admin/dashboard');
    await expect(page.getByText('لوحة التحكم')).toBeVisible();
    // لوحة المطعم تعرض "مبيعات اليوم" و"الطاولات المشغولة" (لا بيانات معارض)
    await expect(page.getByText('مبيعات اليوم')).toBeVisible();
    expect(errs.filter((e) => !/favicon|manifest|supabase/i.test(e))).toEqual([]);
  });

  test('قائمة المطعم لا تخلط أقسام التجزئة', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/admin/dashboard');
    // يجب أن يرى قسم/روابط المطعم
    await expect(page.getByText('المطعم', { exact: false })).toBeVisible();
    // ويجب ألّا يرى أقسام التجزئة (المعارض/الجملة) في القائمة الجانبية
    await expect(page.getByRole('link', { name: 'المعارض' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'الجملة' })).toHaveCount(0);
  });

  test('صفحة تحليلات المطعم تفتح بلا خطأ', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/admin/restaurant/reports');
    await expect(page.getByText(/تحليلات|تقارير/)).toBeVisible();
    // أزرار الفترات
    await expect(page.getByText('آخر ٧ أيام')).toBeVisible();
  });

  test('شاشة الطاولات (POS) تفتح', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/admin/restaurant/pos');
    await expect(page.getByText(/الطاولات|سفري|توصيل/)).toBeVisible();
  });
});
