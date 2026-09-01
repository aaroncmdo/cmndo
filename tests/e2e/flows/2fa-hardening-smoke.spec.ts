import { test, expect, type Page } from '@playwright/test'
import { computeTotp } from '../lib/totp.mjs'

// 2FA-Härtungs-Smoke (AAR-audit-2fa) — POST-DEPLOY, opt-in, gegen Prod.
// Beweist auf echtem Prod-GoTrue-AAL + Middleware-Wiring: F3 (ein Faktor-Halter
// ist 2FA-gated + TOTP-Flow führt ins Portal) und Bypass-zu (gefälschtes
// claimondo_remember überspringt 2FA NICHT).
//
// 2FA ist prod OPTIONAL (Mandatory-Umkehr 08.07.) → die 5 geteilten Test-Accounts
// sind faktorfrei (kein manueller Lockout). Diese Smoke nutzt daher ein DEDIZIERTES,
// isoliertes Faktor-Konto smoke-2fa@ (dispatch) → scripts/seed-smoke-2fa.mjs.
//
// F2 (SV-/gutachter-Exemption entfernt) ist auf Unit-Ebene abgedeckt
// (src/lib/auth/mfa-gate.test.ts: "challenge auch auf /gutachter") und bräuchte
// sonst ein zweites Faktor-SV-Konto → hier bewusst geskippt.
//
// Run (bewusst opt-in, NIE in CI — analog golden-path-prod):
//   RUN_2FA_SMOKE=1 SMOKE_2FA_TOTP_SECRET=... \
//     npx playwright test 2fa-hardening-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'

const SMOKE = {
  email: process.env.SMOKE_2FA_EMAIL ?? 'smoke-2fa@claimondo.de',
  pass: process.env.SMOKE_2FA_PASSWORD ?? '',
  secret: process.env.SMOKE_2FA_TOTP_SECRET,
}

// Frischer SW-freier Context (gecachte alte Bundles würden frisch-deploytes Prod verfehlen).
test.use({ serviceWorkers: 'block' })
test.skip(!process.env.RUN_2FA_SMOKE, 'set RUN_2FA_SMOKE=1 (läuft echt gegen Prod; braucht smoke-2fa@ mit TOTP-Faktor)')

async function submitLogin(page: Page, email: string, pass: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
}

test('F3 — Faktor-Halter (dispatch) ist 2FA-gated + TOTP-Flow fuehrt ins Portal', async ({ page }) => {
  test.skip(!SMOKE.secret, 'SMOKE_2FA_TOTP_SECRET fehlt (scripts/seed-smoke-2fa.mjs)')
  test.setTimeout(60_000)
  await submitLogin(page, SMOKE.email, SMOKE.pass)
  // Faktor-Halter -> Challenge auf /login/2fa.
  expect(page.url(), 'Faktor-Halter muss auf /login/2fa gechallenged werden').toContain('/login/2fa')
  // TOTP erfuellen -> Portal.
  await page.fill('input[autocomplete="one-time-code"]', computeTotp(SMOKE.secret!))
  await page.getByRole('button', { name: /Bestätigen/ }).click()
  await page.waitForURL((u) => u.pathname.startsWith('/dispatch'), { timeout: 20_000 })
  expect(page.url()).toContain('/dispatch')
})

test('Bypass zu — gefaelschtes claimondo_remember ueberspringt 2FA NICHT', async ({ page, context }) => {
  test.skip(!SMOKE.secret, 'SMOKE_2FA_TOTP_SECRET fehlt')
  test.setTimeout(60_000)
  await submitLogin(page, SMOKE.email, SMOKE.pass)
  expect(page.url()).toContain('/login/2fa')
  // Trusted-Device faelschen (reine Cookie-Presence darf 2FA NICHT umgehen — der
  // Token wird gehasht gegen auth_remember_tokens validiert, "1" ist kein Token).
  await context.addCookies([{ name: 'claimondo_remember', value: '1', url: APP }])
  await page.goto(`${APP}/dispatch/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForURL((u) => u.pathname.includes('/login/2fa'), { timeout: 15_000 })
  expect(page.url(), 'gefaelschtes claimondo_remember darf 2FA nicht umgehen').toContain('/login/2fa')
})

// F2 (SV-/gutachter-Exemption entfernt) ist unit-covered in mfa-gate.test.ts
// ("challenge auch auf /gutachter (Exemption entfernt)") und braeuchte sonst ein
// zweites Faktor-SV-Konto → bewusst als e2e geskippt statt ein weiteres
// persistentes Faktor-Konto auf Prod anzulegen.
test.skip('F2 — SV mit Faktor wird auf /gutachter gechallenged (unit-covered: mfa-gate.test)', async () => {})
