import { test, expect, type Page } from '@playwright/test'
import { computeTotp } from '../lib/totp.mjs'
import { basicAuthFuerZiel } from '../lib/ziel'

// 2FA-Enroll-Smoke (AAR-audit-2fa) — POST-DEPLOY, opt-in, gegen Prod.
//
// Beweist: ein FRISCH registrierter (faktorfreier) User kann in den Konto-
// Einstellungen die Authenticator-App (TOTP) selbst einrichten und wird danach
// beim Login gechallenged. Deckt die Enroll-UI (KontoSicherheitPanel /
// TotpEnrollCard) ab — die keine andere Smoke prüft. Das Panel ist rollen-
// agnostisch (Guard „rein kosmetisch") -> der dispatch-Lauf ist repräsentativ.
//
// Voraussetzung: scripts/seed-smoke-enroll.mjs lief (smoke-enroll@ existiert +
// ist FAKTORFREI). Der Test enrollt einen Faktor -> vor jedem Re-Run das Seed-
// Script erneut laufen lassen (setzt faktorfrei zurück). Frischer SW-freier
// Browser. NUR Test-Accounts (nie echte Nutzer).
//
// Run:
//   CLAIMONDO_ENV_FILE=.../.env.local node scripts/seed-smoke-enroll.mjs
//   RUN_2FA_ENROLL_SMOKE=1 npx playwright test 2fa-enroll-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const EMAIL = process.env.SMOKE_ENROLL_EMAIL ?? 'smoke-enroll@claimondo.de'
const PW = process.env.SMOKE_ENROLL_PASSWORD ?? 'Claimondo2026!'

test.use({ serviceWorkers: 'block' })
test.skip(
  !process.env.RUN_2FA_ENROLL_SMOKE,
  'set RUN_2FA_ENROLL_SMOKE=1 (läuft echt gegen Prod; braucht faktorfreies smoke-enroll@ via scripts/seed-smoke-enroll.mjs)',
)

async function login(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PW)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
}

test('frischer User richtet 2FA (TOTP) selbst ein + wird danach beim Login gechallenged', async ({ browser }) => {
  test.setTimeout(90_000)

  // 1. Frischer, faktorfreier User -> direkt ins Portal (kein 2FA, da optional).
  const ctxA = await browser.newContext({ serviceWorkers: 'block', httpCredentials: basicAuthFuerZiel() })
  const pageA = await ctxA.newPage()
  await login(pageA)
  expect(pageA.url(), 'faktorfrei -> direkt ins Portal').not.toContain('/login/2fa')

  // 2. Konto-Sicherheit -> Authenticator-App-Card -> „Einrichten".
  await pageA.goto(`${APP}/dispatch/konto`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  const totpCard = pageA
    .getByRole('heading', { name: 'Authenticator-App', level: 3 })
    .locator('xpath=ancestor::div[contains(@class,"rounded-ios-xl")][1]')
  await expect(totpCard).toBeVisible({ timeout: 15_000 })
  await totpCard.getByRole('button', { name: 'Einrichten' }).click()

  // 3. Enroll-Modal: Secret lesen -> TOTP berechnen -> „Bestätigen".
  const secretP = pageA.locator('p.select-all')
  await expect(secretP, 'base32-Secret erscheint (enrolleTotpFaktor aufgelöst)').toBeVisible({ timeout: 20_000 })
  const secret = (await secretP.innerText()).replace(/\s/g, '')
  expect(secret.length, 'Secret sichtbar').toBeGreaterThan(10)
  await pageA.locator('input[autocomplete="one-time-code"]').fill(computeTotp(secret))
  await pageA.getByRole('button', { name: 'Bestätigen' }).click()

  // 4. Erfolg: die Card flippt auf „Eingerichtet" (Faktor verifiziert/aktiv).
  await expect(totpCard.getByText('Eingerichtet', { exact: false }), 'Faktor aktiv nach Enroll').toBeVisible({
    timeout: 20_000,
  })
  await ctxA.close()

  // 5. Enforcement: ein frischer Login wird jetzt 2FA-gechallenged. Bewusst OHNE
  //    zweiten TOTP-Verify (der Code aus Schritt 3 wäre im selben 30s-Fenster
  //    replay-gesperrt) — der Challenge-Redirect allein beweist das Enforcement.
  const ctxB = await browser.newContext({ serviceWorkers: 'block', httpCredentials: basicAuthFuerZiel() })
  const pageB = await ctxB.newPage()
  await login(pageB)
  expect(pageB.url(), 'nach Enroll: Login ist jetzt 2FA-gated').toContain('/login/2fa')
  await ctxB.close()
})
