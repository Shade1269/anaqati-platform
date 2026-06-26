import { test, expect } from '@playwright/test';
import { env, loginEmployee, trackConsoleErrors } from './helpers';

test.describe('تطبيق الموظف', () => {
  test.skip(!env.empPhone || !env.empCode, 'بيانات الموظف غير مضبوطة (E2E_EMP_PHONE/CODE)');

  test('تسجيل دخول الموظف يفتح التطبيق', async ({ page }) => {
    const errs = trackConsoleErrors(page);
    await loginEmployee(page);
    await expect(page).toHaveURL(/\/employee/);
    expect(errs.filter((e) => !/favicon|manifest|supabase/i.test(e))).toEqual([]);
  });

  test('شاشة الطاولات للموظف (نادل) تفتح', async ({ page }) => {
    await loginEmployee(page);
    await page.goto('/employee/restaurant');
    // إمّا الطاولات أو رسالة عدم الصلاحية — كلاهما بلا انهيار
    await expect(page.getByText(/الطاولات|سفري|توصيل|صلاحية/)).toBeVisible();
  });

  test('شاشة المطبخ للموظف تفتح', async ({ page }) => {
    await loginEmployee(page);
    await page.goto('/employee/kitchen');
    await expect(page.getByText(/المطبخ|الطلبات|لا طلبات|صلاحية/)).toBeVisible();
  });
});
