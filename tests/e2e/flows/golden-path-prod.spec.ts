import { test, expect, type Page } from '@playwright/test'
import { ROLES as BASIS } from './_golden-path-lib'

// Golden-Path Journey E2E — PARTNER-SICHER, gegen Prod (oder env-Override).
//
// Warum diese Spec: die Kundenstrecke bis Abschluss end-to-end im echten Browser
// beweisen, OHNE einen echten Gutachter zu buchen/stoeren. Der Live-Finder ist
// bewusst test-feindlich (filtert Test-SVs via isTestAccount) — deshalb nutzt diese
// Strecke den partner-sicheren Pfad: Entry via /schaden-melden (kein SV-Matching),
// SV-Zuweisung/Progression ueber Test-Accounts, Rollensichten via echte Logins.
//
// Entry-Host (Funnel) = claimondo.de; Portal-Host = app.claimondo.de.
// Alle Test-Identitaeten @claimondo.de => istInterneIdentitaet=true => der
// reserviere()-Guard blockt jede versehentliche Buchung eines echten SV hart.
//
// Run (bewusst opt-in, nie in CI):
//   RUN_GOLDEN_PATH_PROD=1 \
//   TEST_SV_PASSWORD='<stark>' \
//   npx playwright test golden-path-prod --workers=1 --reporter=line

const FUNNEL = process.env.GOLDEN_FUNNEL_URL ?? 'https://claimondo.de'
const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'

// Credentials kommen aus _golden-path-lib (die Quelle), hier nur die Erwartungen je Rolle.
// Vorher stand hier eine eigene Kopie — und genau die driftete: sie trug noch
// `test-kunde@` (Konto seit dem Golive-Cleanup geloescht) und `Test1234!` fuer
// admin/kb/kunde (auf prod nur noch bei test-dispatch@ gueltig). Die Messung, die das
// belegt, steht im Kommentar an ROLES in _golden-path-lib.ts.
const ROLES = {
  admin: { ...BASIS.admin, landing: /\/admin/, marker: /Dashboard|Fälle|Aufgaben/i },
  dispatch: { ...BASIS.dispatch, landing: /\/dispatch/, marker: /Leads|Rückrufe|Gutachter/i },
  kunde: { ...BASIS.kunde, landing: /\/kunde/, marker: /Mein Fall|Termine|Nachrichten/i },
  kb: { ...BASIS.kb, landing: /\/mitarbeiter/, marker: /Meine Fälle|Tasks|Termine/i },
  sv: { ...BASIS.sv, landing: /\/gutachter/, marker: /Aufträge|Termine|Fälle|Gutachten/i },
} as const

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.RUN_GOLDEN_PATH_PROD, 'set RUN_GOLDEN_PATH_PROD=1 (läuft echt gegen Prod)')

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(pass)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(6_000)
}

// ── Stage 1: Kunde erzeugt einen Lead ueber den Funnel (partner-sicher, kein SV-Matching) ──
test('Stage 1 — Kunde: /schaden-melden erzeugt Lead', async ({ page }) => {
  test.setTimeout(90_000)
  const runId = String(Date.now())
  const email = `e2e-golden-${runId}@claimondo.de` // istInterneIdentitaet → Guard schuetzt echte SVs
  await page.goto(`${FUNNEL}/schaden-melden`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('.CookieConsent button, [class*="CookieConsent"] button').first().click({ timeout: 4_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
  await page.locator('#unfallort').first().fill('Domkloster 4, 50667 Köln')
  await page.locator('#vorname').first().fill(`E2eGolden${runId}`).catch(() => {})
  await page.locator('#nachname').first().fill('Smoke').catch(() => {})
  await page.locator('#telefon').first().fill('+491633628571').catch(() => {}) // Test-WA
  await page.locator('#email').first().fill(email)
  await page.locator('[data-slot="checkbox"], input[type="checkbox"]').first().click().catch(() => {})
  await page.getByRole('button', { name: /link erhalten|sicheren link|jetzt melden|anfrage/i }).first().click()
  await page.waitForURL(/\/schaden-melden\/(link-versendet|selbstverschulden)/, { timeout: 20_000 })
  expect(page.url()).toContain('/schaden-melden/')
  console.log(`[golden] Lead erzeugt: ${email}`)
})

// ── Stage 2..6: Jede Rolle loggt ein und landet in ihrem Business-Portal ──
for (const [rolle, cfg] of Object.entries(ROLES)) {
  test(`Rollensicht — ${rolle} landet in seinem Portal`, async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(rolle === 'sv' && !cfg.pass, 'TEST_SV_PASSWORD nicht gesetzt')
    await login(page, cfg.email, cfg.pass)
    const path = new URL(page.url()).pathname
    expect(path, `${rolle} soll rollen-korrekt landen`).toMatch(cfg.landing)
    const body = await page.locator('body').innerText().catch(() => '')
    expect(body, `${rolle} soll sein Business sehen`).toMatch(cfg.marker)
    console.log(`[golden] ${rolle} → ${path} ✓`)
  })
}
