import { Page, expect } from '@playwright/test';

export const env = {
  ownerEmail: process.env.E2E_OWNER_EMAIL || '',
  ownerPassword: process.env.E2E_OWNER_PASSWORD || '',
  empPhone: process.env.E2E_EMP_PHONE || '',
  empCode: process.env.E2E_EMP_CODE || '',
  tenantId: process.env.E2E_TENANT_ID || '',
  runFlows: process.env.E2E_RUN_FLOWS === '1',
};

/** تسجيل دخول المالك/المشترك عبر /admin/login */
export async function loginOwner(page: Page) {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').first().fill(env.ownerEmail);
  await page.locator('input[type="password"]').first().fill(env.ownerPassword);
  await page.getByRole('button', { name: /دخول|تسجيل/ }).first().click();
  // ننتظر مغادرة صفحة الدخول فعليًا (لا نطابق /admin/login)
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.includes('login'), { timeout: 30_000 });
}

/** تسجيل دخول الموظف عبر /employee/login */
export async function loginEmployee(page: Page) {
  await page.goto('/employee/login');
  const inputs = page.locator('input');
  await inputs.nth(0).fill(env.empPhone); // الجوال
  await inputs.nth(1).fill(env.empCode); // كود الوصول
  await page.getByRole('button', { name: /دخول|تسجيل/ }).first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/employee') && !u.pathname.includes('login'), { timeout: 30_000 });
}

/**
 * يلتقط أخطاء JavaScript الحقيقية فقط (استثناءات غير مُلتقطة + console.error)،
 * مع تجاهل ضجيج تحميل الموارد (favicon/manifest/network/CORS) التي ليست أعطال كود.
 */
const BENIGN = /favicon|manifest|Failed to load resource|net::ERR|ERR_|status of 4\d\d|status of 5\d\d|supabase\.co/i;
export function trackConsoleErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(String(e))); // استثناءات JS الحقيقية دائمًا
  return errs;
}

export { expect };
