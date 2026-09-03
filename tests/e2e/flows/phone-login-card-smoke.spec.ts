import { test, expect, type Page } from '@playwright/test'

// Telefon-Login-Karte-Smoke (AAR-phone-login Phase 2) — POST-DEPLOY, opt-in, gegen Prod.
//
// Beweist: die neue Selbst-Service-„Telefon-Login"-Karte rendert im geteilten
// KontoSicherheitPanel fuer eine echte Rolle (rollen-agnostisches Panel → der
// dispatch-Lauf ist repraesentativ). Deckt Teil 2 der Phase-2-Auslieferung ab.
// KEIN SMS-Round-Trip (der braucht echten SMS-Empfang, nicht automatisierbar) —
// nur die Praesenz der Karte + des Aktivieren/Aendern-Buttons.
//
// Voraussetzung: ein faktorfreies Test-Konto (direkter Login, kein 2FA-Screen).
// NUR Test-Accounts (nie echte Nutzer). Frischer SW-freier Browser.
//
// Run:
//   RUN_PHONE_LOGIN_CARD_SMOKE=1 CI=1 npx playwright test phone-login-card-smoke --workers=1 --reporter=line

const APP = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const EMAIL = process.env.SMOKE_PHONE_LOGIN_EMAIL ?? 'test-dispatch@claimondo.de'
const PW = process.env.SMOKE_PHONE_LOGIN_PASSWORD ?? ''
const KONTO = process.env.SMOKE_PHONE_LOGIN_KONTO ?? '/dispatch/konto'

test.use({ serviceWorkers: 'block' })
test.skip(
  !process.env.RUN_PHONE_LOGIN_CARD_SMOKE,
  'set RUN_PHONE_LOGIN_CARD_SMOKE=1 (läuft echt gegen Prod; braucht faktorfreies Test-Konto)',
)

async function login(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PW)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 })
}

test('Telefon-Login-Karte rendert im Konto-Sicherheit-Panel für eine echte Rolle', async ({ browser }) => {
  test.setTimeout(60_000)
  const ctx = await browser.newContext({ serviceWorkers: 'block' })
  const page = await ctx.newPage()

  await login(page)
  expect(page.url(), 'faktorfrei -> direkt ins Portal (kein 2FA-Screen)').not.toContain('/login/2fa')

  await page.goto(`${APP}${KONTO}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  // Auf die Telefon-Login-Karte scopen (ancestor-Card-<div>) — sonst kollidiert der
  // Button-Matcher mit der 2FA-Nummer-Karte, die ebenfalls „Nummer ändern" hat.
  const card = page
    .getByRole('heading', { name: 'Telefon-Login', level: 3 })
    .locator('xpath=ancestor::div[contains(@class,"rounded-ios-xl")][1]')
  await expect(card, 'Telefon-Login-Karte rendert im Panel').toBeVisible({ timeout: 15_000 })

  await expect(
    card.getByRole('button', { name: /Telefon-Login aktivieren|Nummer ändern/ }),
    'Aktivieren/Ändern-Button rendert (in der Karte)',
  ).toBeVisible({ timeout: 10_000 })

  await ctx.close()
})
