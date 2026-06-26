import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: 'e2e/.env' });

/**
 * إعداد اختبارات الواجهة (E2E) لمنصّة سندباد.
 * شغّلها من جهازك حيث الموقع مفتوح:
 *   E2E_BASE_URL=https://www.sindbadsa.com npm run e2e
 * أو على نسخة محلية: E2E_BASE_URL=http://localhost:5173 npm run dev (في نافذة) ثم npm run e2e
 *
 * بيانات الدخول تُمرَّر عبر متغيّرات البيئة (انظر e2e/.env.example).
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://www.sindbadsa.com',
    locale: 'ar',
    headless: true,
    viewport: { width: 1366, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
