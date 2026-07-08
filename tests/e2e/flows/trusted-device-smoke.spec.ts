import { test, expect, type Page } from '@playwright/test'
import { computeTotp } from '../lib/totp.mjs'

// Trusted-Device-Management-Smoke (PR #3819, A+B+C+E) — POST-DEPLOY, opt-in, gegen Prod.
//
// Beweist A: die Geraete-Verwaltung ist im geteilten KontoSicherheitPanel eingehaengt
// und rendert fuer eine interne Pflicht-2FA-Rolle (dispatch) OHNE die Konto-Seite zu
// zerschiessen — d.h. der ownership-gegatete Server-Action getMyTrustedDevices laeuft
// auf Prod ohne Crash. Der eigentliche Einzel-Widerruf braucht ein geseedetes Token;
// dieser Render-Smoke deckt die kritische Regressions-Flaeche (kein 500 nach dem
// Embed, Sektion + Leerzustand/Zeilen vorhanden) ohne Prod-Datenmanipulation ab.
//
// Voraussetzung: scripts/seed-test-2fa.mjs lief (test-dispatch hat TOTP-Faktor) UND
// TEST_DISPATCH_TOTP_SECRET ist gesetzt. Frischer SW-freier Browser (BROADCAST
// prod-smokes-fresh-sw-browser). NUR Test-Accounts (nie echte Nutzer).
//
// Run (bewusst opt-in, NIE in CI — analog 2fa-hardening-smoke / golden-path-prod):
//   RUN_TRUSTED_DEVICE_SMOKE=1 TEST_DISPATCH_TOTP_SECRET=... \
//     npx playwright test trusted-device-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'

const DISPATCH = {
  email: process.env.TEST_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de',
  pass: process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!',
  secret: process.env.TEST_DISPATCH_TOTP_SECRET,
}

// Frischer SW-freier Context (gecachte alte Bundles wuerden frisch-deploytes Prod verfehlen).
test.use({ serviceWorkers: 'block' })
test.skip(!process.env.RUN_TRUSTED_DEVICE_SMOKE, 'set RUN_TRUSTED_DEVICE_SMOKE=1 (laeuft echt gegen Prod; braucht geseedeten TOTP-dispatch)')

async function loginDispatch(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(DISPATCH.email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(DISPATCH.pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
  // Interne Pflicht-Rolle -> 2FA-Challenge (F3). TOTP erfuellen -> Portal.
  if (page.url().includes('/login/2fa')) {
    await page.fill('input[autocomplete="one-time-code"]', computeTotp(DISPATCH.secret!))
    await page.getByRole('button', { name: /Bestätigen/ }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  }
}

test('A — /dispatch/konto rendert die "Vertraute Geraete"-Sektion (Embed + getMyTrustedDevices ok, kein 500)', async ({ page }) => {
  test.skip(!DISPATCH.secret, 'TEST_DISPATCH_TOTP_SECRET fehlt (scripts/seed-test-2fa.mjs)')
  test.setTimeout(60_000)
  await loginDispatch(page)

  // Konto-Sicherheits-Seite traegt das geteilte KontoSicherheitPanel (2FA + Geraete).
  const resp = await page.goto(`${APP}/dispatch/konto`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  expect(resp?.status() ?? 0, '/dispatch/konto darf nicht 5xx sein').toBeLessThan(500)

  // Panel intakt: der bestehende 2FA-Block rendert ...
  await expect(page.getByRole('heading', { name: /Zwei-Faktor-Authentifizierung/ })).toBeVisible({ timeout: 15_000 })
  // ... und die neue Geraete-Sektion ist eingehaengt (A).
  await expect(page.getByRole('heading', { name: /Vertraute Geräte/ })).toBeVisible({ timeout: 15_000 })

  // getMyTrustedDevices lief ohne Crash: entweder Geraete-Zeilen (Widerrufen-Button)
  // ODER der Leerzustand ("Keine vertrauten Geräte") muss sichtbar sein.
  const widerrufButtons = await page.getByRole('button', { name: /Widerrufen/ }).count()
  const leerzustand = await page.getByText(/Keine vertrauten Geräte/).count()
  expect(widerrufButtons + leerzustand, 'Geraete-Liste ODER Leerzustand muss rendern').toBeGreaterThan(0)
})
