import { test, expect, type Page } from '@playwright/test'
import { computeTotp } from '../lib/totp.mjs'

// Trusted-Device-Management-Smoke (PR #3819) — POST-DEPLOY, opt-in, gegen Prod.
//
// Deckt ab:
//  A: /dispatch/konto rendert die "Vertraute Geräte"-Sektion (KontoSicherheitPanel
//     eingehängt, ownership-gegateter getMyTrustedDevices ohne Crash) NACH echtem
//     2FA-Challenge — die kritische Regressions-Fläche (kein 500 nach dem Embed).
//  B: Trust-Skip — "Diesem Gerät vertrauen" setzt ein echtes claimondo_remember;
//     ein Folgekontext mit diesem Token wird vom Middleware-Gate zum geschützten
//     Pfad durchgelassen (kein Re-Challenge). Gegenprobe (gefälschtes Token wird
//     abgelehnt) liegt im 2fa-hardening-Smoke.
//
// 2FA ist prod OPTIONAL (Mandatory-Umkehr 08.07.) → dediziertes, isoliertes
// Faktor-Konto smoke-2fa@ (dispatch) → scripts/seed-smoke-2fa.mjs. Frischer
// SW-freier Browser. NUR Test-Accounts (nie echte Nutzer).
//
// Run (bewusst opt-in, NIE in CI):
//   RUN_TRUSTED_DEVICE_SMOKE=1 SMOKE_2FA_TOTP_SECRET=... \
//     npx playwright test trusted-device-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'

const SMOKE = {
  email: process.env.SMOKE_2FA_EMAIL ?? 'smoke-2fa@claimondo.de',
  pass: process.env.SMOKE_2FA_PASSWORD ?? '',
  secret: process.env.SMOKE_2FA_TOTP_SECRET,
}

test.use({ serviceWorkers: 'block' })
test.skip(
  !process.env.RUN_TRUSTED_DEVICE_SMOKE,
  'set RUN_TRUSTED_DEVICE_SMOKE=1 (laeuft echt gegen Prod; braucht smoke-2fa@ mit TOTP-Faktor)',
)

// Login bis /login/2fa; optional "Diesem Geraet vertrauen" ankreuzen; TOTP -> Portal.
async function loginMit2fa(page: Page, opts: { trust: boolean }) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(SMOKE.email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(SMOKE.pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
  // Faktor-Halter -> 2FA-Challenge. TOTP erfuellen -> Portal.
  if (page.url().includes('/login/2fa')) {
    if (opts.trust) await page.locator('input[type="checkbox"]').first().check()
    await page.fill('input[autocomplete="one-time-code"]', computeTotp(SMOKE.secret!))
    await page.getByRole('button', { name: /Bestätigen/ }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  }
}

test('A — /dispatch/konto rendert die "Vertraute Geraete"-Sektion (Embed + getMyTrustedDevices ok, kein 500)', async ({
  page,
}) => {
  test.skip(!SMOKE.secret, 'SMOKE_2FA_TOTP_SECRET fehlt (scripts/seed-smoke-2fa.mjs)')
  test.setTimeout(60_000)
  await loginMit2fa(page, { trust: false })

  // Konto-Sicherheits-Seite traegt das geteilte KontoSicherheitPanel (2FA + Geraete).
  const resp = await page.goto(`${APP}/dispatch/konto`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  expect(resp?.status() ?? 0, '/dispatch/konto darf nicht 5xx sein').toBeLessThan(500)

  await expect(page.getByRole('heading', { name: /Zwei-Faktor-Authentifizierung/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /Vertraute Geräte/ })).toBeVisible({ timeout: 15_000 })

  // getMyTrustedDevices lief ohne Crash: Geraete-Zeilen (Widerrufen) ODER Leerzustand.
  const widerrufButtons = await page.getByRole('button', { name: /Widerrufen/ }).count()
  const leerzustand = await page.getByText(/Keine vertrauten Geräte/).count()
  expect(widerrufButtons + leerzustand, 'Geraete-Liste ODER Leerzustand muss rendern').toBeGreaterThan(0)
})

test('B — vertrautes Geraet ueberspringt 2FA (echtes claimondo_remember -> Middleware laesst durch)', async ({
  browser,
}) => {
  test.skip(!SMOKE.secret, 'SMOKE_2FA_TOTP_SECRET fehlt')
  test.setTimeout(90_000)

  // 1. Erstkontext: login + "Diesem Geraet vertrauen" + TOTP -> Portal, echtes Token.
  const ctxA = await browser.newContext({ serviceWorkers: 'block' })
  const pageA = await ctxA.newPage()
  await loginMit2fa(pageA, { trust: true })
  expect(pageA.url(), 'nach 2FA im dispatch-Portal').toContain('/dispatch')
  const remember = (await ctxA.cookies()).find((c) => c.name === 'claimondo_remember')
  expect(remember?.value, 'claimondo_remember muss gesetzt sein (Trust-Token)').toBeTruthy()
  expect(remember?.value, 'echtes Token, nicht der Marker "1"').not.toBe('1')
  await ctxA.close()

  // 2. Folgekontext mit dem ECHTEN Token: password-login landet auf /login/2fa
  //    (login-action routet Faktor-Halter immer dorthin), aber die Navigation zum
  //    geschuetzten Pfad wird vom Middleware-Gate durchgelassen (Trusted-Device).
  const ctxB = await browser.newContext({ serviceWorkers: 'block' })
  await ctxB.addCookies([remember!])
  const pageB = await ctxB.newPage()
  await pageB.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await pageB.locator('input[type="email"], input[name="email"]').first().fill(SMOKE.email)
  await pageB.locator('input[type="password"], input[name="password"]').first().fill(SMOKE.pass)
  await pageB.locator('button[type="submit"]').first().click()
  await pageB.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
  await pageB.goto(`${APP}/dispatch/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await pageB.waitForURL((u) => u.pathname.startsWith('/dispatch'), { timeout: 15_000 })
  expect(pageB.url(), 'vertrautes Geraet: kein Re-Challenge').not.toContain('/login/2fa')
  expect(pageB.url()).toContain('/dispatch')
  await ctxB.close()
})
