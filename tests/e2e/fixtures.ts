import { test as base, type Page } from '@playwright/test'
import path from 'path'
import { computeTotp } from './lib/totp.mjs'

// KFZ-185: Test fixtures with auth-state caching.

const ADMIN_STORAGE = path.join(__dirname, '../../playwright/.auth/admin.json')
const SV_STORAGE = path.join(__dirname, '../../playwright/.auth/sv.json')

async function login(
  page: Page,
  email: string,
  password: string,
  storageFile: string,
  totpSecret?: string,
) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  // Login-Formular verlassen — entweder direkt ins Portal ODER auf den 2FA-Challenge
  // (F3-Pflicht interne Rollen / F2 SV-mit-Faktor). `/login/2fa` enthaelt `/login`,
  // darum hier nur die reine `/login`-Seite ausschliessen, nicht jeden `/login`-Praefix.
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 })
  if (page.url().includes('/login/2fa')) {
    if (!totpSecret) {
      throw new Error(
        `${email}: 2FA-Challenge, aber kein TOTP-Secret. scripts/seed-test-2fa.mjs laufen lassen + Secret als env setzen (TEST_*_TOTP_SECRET).`,
      )
    }
    await page.fill('input[autocomplete="one-time-code"]', computeTotp(totpSecret))
    await page.getByRole('button', { name: /Bestätigen/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
  }
  await page.context().storageState({ path: storageFile })
}

// Fixtures that provide pre-authenticated pages
export const test = base.extend<{
  adminPage: Page
  svPage: Page
}>({
  // ⚠ Passwort-Default: `Claimondo2026!`, NICHT `Test1234!`.
  // Konvention (memory/reference-internal-test-account-logins.md): test-*@ = Claimondo2026!,
  // AUSNAHME test-dispatch = Test1234!. Genau diese Ausnahme stand hier als Default fuer
  // ALLE Rollen — nachgemessen 20.08. per echtem Login gegen prod:
  //   test-admin@ + Claimondo2026! -> /admin        test-sv@ + Claimondo2026! -> /gutachter/heute
  // Wirkung des falschen Defaults: greift kein CI-Secret, scheitert der Login. Beim SV war
  // genau das der Fall — ALLE 8 `Gutachter Routes`-Tests in routes.spec.ts liefen dadurch in
  // den 15s-Timeout (Lauf 32362782482), waehrend die Admin-Routen gruen blieben, weil dort
  // ein Secret greift. Der Default ist also kein Detail, sondern der Fallback, der traegt,
  // wenn ein Secret fehlt oder leer ist.
  adminPage: async ({ browser }, use) => {
    const email = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de'
    const password = process.env.TEST_ADMIN_PASSWORD ?? 'Claimondo2026!'
    const ctx = await browser.newContext({ storageState: ADMIN_STORAGE }).catch(async () => {
      // First run — no stored state, login fresh
      const freshCtx = await browser.newContext()
      const page = await freshCtx.newPage()
      await login(page, email, password, ADMIN_STORAGE, process.env.TEST_ADMIN_TOTP_SECRET)
      await page.close()
      await freshCtx.close()
      return browser.newContext({ storageState: ADMIN_STORAGE })
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  svPage: async ({ browser }, use) => {
    const email = process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de'
    // s. Kommentar bei adminPage — DIESER Default war der, der die 8 Gutachter-Routen kippte.
    const password = process.env.TEST_SV_PASSWORD ?? 'Claimondo2026!'
    const ctx = await browser.newContext({ storageState: SV_STORAGE }).catch(async () => {
      const freshCtx = await browser.newContext()
      const page = await freshCtx.newPage()
      await login(page, email, password, SV_STORAGE, process.env.TEST_SV_TOTP_SECRET)
      await page.close()
      await freshCtx.close()
      return browser.newContext({ storageState: SV_STORAGE })
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },
})

export { expect } from '@playwright/test'
