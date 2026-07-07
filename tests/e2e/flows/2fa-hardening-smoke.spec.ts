import { test, expect, type Page } from '@playwright/test'
import { computeTotp } from '../lib/totp.mjs'

// 2FA-Härtungs-Smoke (AAR-audit-2fa) — POST-DEPLOY, opt-in, gegen Prod.
// Beweist: F3 (interne Rolle ist 2FA-gated + TOTP-Flow ins Portal), Bypass-zu
// (gefälschtes claimondo_remember überspringt 2FA NICHT), F2 (SV-mit-Faktor wird
// auf /gutachter gechallenged — Exemption entfernt).
//
// Voraussetzung: scripts/seed-test-2fa.mjs lief (Test-Accounts haben TOTP-Faktoren)
// UND die Secrets sind als env gesetzt. Frischer SW-freier Browser (BROADCAST
// prod-smokes-fresh-sw-browser). Nur Test-Accounts (nie echte Nutzer).
//
// Run (bewusst opt-in, NIE in CI — analog golden-path-prod):
//   RUN_2FA_SMOKE=1 TEST_DISPATCH_TOTP_SECRET=... \
//     [TEST_SV_TOTP_SECRET=... TEST_SV_PASSWORD=...] \
//     npx playwright test 2fa-hardening-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'

const DISPATCH = {
  email: process.env.TEST_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de',
  pass: process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!',
  secret: process.env.TEST_DISPATCH_TOTP_SECRET,
}
const SV = {
  email: process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de',
  pass: process.env.TEST_SV_PASSWORD ?? '',
  secret: process.env.TEST_SV_TOTP_SECRET,
}

// Frischer SW-freier Context (gecachte alte Bundles würden frisch-deploytes Prod verfehlen).
test.use({ serviceWorkers: 'block' })
test.skip(!process.env.RUN_2FA_SMOKE, 'set RUN_2FA_SMOKE=1 (läuft echt gegen Prod; braucht geseedete TOTP-Accounts)')

async function submitLogin(page: Page, email: string, pass: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
}

test('F3 — interne Rolle (dispatch) ist 2FA-gated + TOTP-Flow fuehrt ins Portal', async ({ page }) => {
  test.skip(!DISPATCH.secret, 'TEST_DISPATCH_TOTP_SECRET fehlt (scripts/seed-test-2fa.mjs)')
  test.setTimeout(60_000)
  await submitLogin(page, DISPATCH.email, DISPATCH.pass)
  // Pflicht-Rolle mit Faktor -> Challenge auf /login/2fa.
  expect(page.url(), 'dispatch muss auf /login/2fa gechallenged werden').toContain('/login/2fa')
  // TOTP erfuellen -> Portal.
  await page.fill('input[autocomplete="one-time-code"]', computeTotp(DISPATCH.secret!))
  await page.getByRole('button', { name: /Bestätigen/ }).click()
  await page.waitForURL((u) => u.pathname.startsWith('/dispatch'), { timeout: 20_000 })
  expect(page.url()).toContain('/dispatch')
})

test('Bypass zu — gefaelschtes claimondo_remember ueberspringt 2FA NICHT', async ({ page, context }) => {
  test.skip(!DISPATCH.secret, 'TEST_DISPATCH_TOTP_SECRET fehlt')
  test.setTimeout(60_000)
  await submitLogin(page, DISPATCH.email, DISPATCH.pass)
  expect(page.url()).toContain('/login/2fa')
  // Trusted-Device faelschen (reine Cookie-Presence darf 2FA NICHT umgehen — der
  // Token wird gehasht gegen auth_remember_tokens validiert, "1" ist kein Token).
  await context.addCookies([{ name: 'claimondo_remember', value: '1', url: APP }])
  await page.goto(`${APP}/dispatch/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForURL((u) => u.pathname.includes('/login/2fa'), { timeout: 15_000 })
  expect(page.url(), 'gefaelschtes claimondo_remember darf 2FA nicht umgehen').toContain('/login/2fa')
})

test('F2 — SV mit Faktor wird auf /gutachter gechallenged (Exemption entfernt)', async ({ page }) => {
  test.skip(!SV.secret || !SV.pass, 'TEST_SV_TOTP_SECRET / TEST_SV_PASSWORD fehlen')
  test.setTimeout(60_000)
  await submitLogin(page, SV.email, SV.pass)
  // Vor F2 waere der SV direkt ins /gutachter-Portal gelaufen (2FA-frei). Jetzt: Challenge.
  expect(page.url(), 'SV mit Faktor muss gechallenged werden (kein /gutachter-2FA-Bypass mehr)').toContain('/login/2fa')
})
