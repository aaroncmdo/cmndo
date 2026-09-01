// Prod-Smoke: Money-Integritaet-Widget im Admin Finance-Hub.
// Login als Admin -> /admin/finance -> "Money-Integritaet"-Card -> "Pruefen" -> Report.
// Laeuft gegen PROD (app.claimondo.de) mit einem Test-Admin-Account.
//
//   node scripts/smoke/money-integrity-widget-smoke.mjs
//
// Env-Override: SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD.

import { chromium } from '@playwright/test'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'test-admin@claimondo.de'
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || ''

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

function log(...a) {
  console.log('[smoke]', ...a)
}

try {
  // 1) Login
  log('Login als', EMAIL, '@', BASE)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', EMAIL)
  await page.fill('input[type="password"], input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 25_000 })
  if (page.url().includes('/login/2fa')) {
    log('SMOKE-BLOCKED: 2FA-Challenge — dieser Account braucht TOTP. Anderen Admin-Account nutzen.')
    process.exit(2)
  }
  log('Login OK ->', page.url())

  // 2) Finance-Hub
  await page.goto(`${BASE}/admin/finance`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (!page.url().includes('/admin/finance')) {
    log('SMOKE-FAIL: /admin/finance redirected ->', page.url(), '(Account kein Admin?)')
    process.exit(1)
  }
  log('Finance-Hub geladen ->', page.url())

  // 3) Money-Integritaet-Card finden + reinscrollen
  const card = page.locator('div.rounded-ios-md', { hasText: /Money-Integrit/i }).first()
  await card.waitFor({ state: 'visible', timeout: 20_000 })
  await card.scrollIntoViewIfNeeded()
  log('Money-Integritaet-Card sichtbar')

  // 4) "Pruefen" klicken (im Card gescoped, damit kein fremder Button erwischt wird)
  const pruefenBtn = card.getByRole('button', { name: /Pr.?fen/i })
  await pruefenBtn.click()
  log('"Pruefen" geklickt — warte auf Report ...')

  // 5) Report abwarten (Erfolg ODER Findings — beides = Widget rendert)
  await page.waitForSelector('text=/Alles konsistent|Finding/i', { timeout: 30_000 })
  const konsistent = await page.getByText(/Alles konsistent/i).count()
  const reportText = (await page.getByText(/Alles konsistent|Finding/i).first().textContent()) || ''
  log('REPORT:', reportText.trim())

  await page.screenshot({ path: 'money-integrity-smoke.png' })
  log('Screenshot -> money-integrity-smoke.png')

  if (konsistent > 0) {
    log('SMOKE-PASS: Widget meldet "Alles konsistent" (Login->Hub->Action->Report e2e OK)')
    process.exit(0)
  }
  log('SMOKE-PASS(mit-Findings): Widget rendert Findings korrekt (Action+Render e2e OK)')
  process.exit(0)
} catch (e) {
  log('SMOKE-FAIL:', e?.message || e)
  await page.screenshot({ path: 'money-integrity-smoke-fail.png' }).catch(() => {})
  process.exit(1)
}
