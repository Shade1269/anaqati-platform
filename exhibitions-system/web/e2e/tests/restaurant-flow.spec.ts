import { test, expect } from '@playwright/test';
import { env, loginOwner } from './helpers';

/**
 * تدفّق فعلي يُنشئ بيانات (يفتح طاولة/طلب/فاتورة). متوقّف افتراضيًا.
 * فعّله بـ E2E_RUN_FLOWS=1 (يُفضّل على مستأجر تجريبي لا على بيانات حقيقية).
 */
test.describe('تدفّق المطعم الكامل (يُنشئ بيانات)', () => {
  test.skip(!env.runFlows, 'متوقّف — فعّل E2E_RUN_FLOWS=1 لتشغيله');
  test.skip(!env.ownerEmail || !env.ownerPassword, 'بيانات المالك غير مضبوطة');

  test('فتح طاولة → إضافة صنف → إرسال للمطبخ → إقفال ودفع نقدًا', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/admin/restaurant/pos');

    // اختر طاولة فاضية
    const freeTable = page.locator('button', { hasText: 'فاضية' }).first();
    await expect(freeTable).toBeVisible();
    await freeTable.click();

    // افتح الطاولة
    const openBtn = page.getByRole('button', { name: 'فتح الطاولة' });
    if (await openBtn.isVisible().catch(() => false)) await openBtn.click();

    // شاشة الجلسة ظهرت
    await expect(page.getByRole('button', { name: /إقفال ودفع/ })).toBeVisible();

    // أضِف أول صنف متاح من المنيو (بطاقة فيها سعر)
    const item = page.locator('button:has-text("ر.")').first();
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      // إن ظهرت خيارات، أضِف
      const addOpt = page.getByRole('button', { name: 'إضافة' });
      if (await addOpt.isVisible().catch(() => false)) await addOpt.click();
      // أرسل للمطبخ
      const send = page.getByRole('button', { name: /إرسال للمطبخ/ });
      if (await send.isVisible().catch(() => false)) await send.click();
    }

    // إقفال ودفع
    await page.getByRole('button', { name: /إقفال ودفع/ }).click();
    await expect(page.getByText('الإجمالي')).toBeVisible();
    await page.getByRole('button', { name: 'نقدًا' }).click();

    // رجع لشاشة الطاولات
    await expect(page.getByText(/الطاولات|سفري|توصيل/)).toBeVisible({ timeout: 20_000 });
  });
});
