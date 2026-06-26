import { test, expect } from '@playwright/test';
import { env, trackConsoleErrors } from './helpers';

test.describe('الصفحات العامة (بلا تسجيل دخول)', () => {
  test('صفحة دخول المشترك تظهر بحقول إيميل وكلمة مرور', async ({ page }) => {
    const errs = trackConsoleErrors(page);
    await page.goto('/admin/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    expect(errs, 'console errors: ' + errs.join(' | ')).toEqual([]);
  });

  test('الجذر يفتح دخول المشترك مباشرة', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('صفحة دخول الموظف تظهر', async ({ page }) => {
    await page.goto('/employee/login');
    await expect(page.locator('input')).toHaveCount(2, { timeout: 15_000 });
  });

  test('منيو الطلب أونلاين للمطعم يحمّل الأصناف', async ({ page }) => {
    test.skip(!env.tenantId, 'E2E_TENANT_ID غير مضبوط');
    const errs = trackConsoleErrors(page);
    await page.goto(`/menu/${env.tenantId}`);
    // إمّا يظهر منيو/اسم مطعم، أو رسالة "غير متاح" بلا انهيار
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    expect(text.length, 'الصفحة فارغة').toBeGreaterThan(10);
    // لا يجب أن تظهر شاشة خطأ React البيضاء
    expect(text).not.toContain('Application error');
    expect(errs, errs.join(' | ')).toEqual([]);
  });
});
