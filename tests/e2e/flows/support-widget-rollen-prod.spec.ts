// stumme-waechter-skip: manueller Prod-Smoke fuer #5936. Laeuft bewusst nicht im e2e-Job —
// er loggt sich mit echten prod-Konten ein und oeffnet das Support-Widget; im nightly waere
// das taeglicher Laerm ohne Erkenntnisgewinn. Kommando steht im PR und im Abnahme-Blatt.
//
// SOLL (memory/abnahmen/2026-09-08-support-meldungen-sammelstelle.md, Abschnitt 1c;
// Entscheidung Aaron 06.09.2026 "kunde raus … makler werkstatt flotte rein"):
//
//   1. Ein PARTNER (Makler/Werkstatt/Flotte) sieht den Knopf "Hilfe und Support" und kommt
//      durch — vorher lief er in ein HTTP 403, obwohl der Knopf sichtbar war (~105 Nutzer).
//   2. Ein ENDKUNDE sieht den Knopf nicht mehr. Dahinter liegt ein Werkzeug, das Tickets im
//      Entwicklungs-Backlog anlegt — kein Kundensupport.
//
// Gemessen wird am VERHALTEN: der Statuscode der Route (nicht der Text im Drawer) und die
// Sichtbarkeit des Bedienelements (nicht seine Existenz im Markup).
import { test, expect, type Page } from '@playwright/test'

const RUN = process.env.RUN_SUPPORT_ROLLEN === '1'
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

const KONTEN = {
  makler: { email: 'test-makler@claimondo.de', pass: process.env.TEST_MAKLER_PASSWORD ?? 'IfJyyoXTh2VAJUXgNgR7WPOn5zUn5tYb' },
  kunde: { email: 'smoke-kunde@claimondo.de', pass: process.env.SMOKE_KUNDE_PASS ?? 'PibnEZfmwnSOiG5AMM61mwpmFNjnvC6u' },
}

const SUPPORT_KNOPF = 'Hilfe und Support öffnen'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/e-?mail/i).first().fill(email)
  await page.getByLabel(/passwort/i).first().fill(pass)
  // ⚠ NICHT button[type=submit].first() — der Logout der Portal-Nav steht im DOM oft VOR dem
  // Seiteninhalt (regel4-smoke, "button[type=submit].first() klickt ABMELDEN").
  await page.getByRole('button', { name: /anmelden|einloggen|login/i }).first().click()
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})
}

test.describe('Support-Widget: Rollen nach #5936', () => {
  test.skip(!RUN, 'RUN_SUPPORT_ROLLEN=1 setzen — manueller Prod-Smoke mit echten Logins')
  test.setTimeout(180_000)

  test('A · Partner (Makler) sieht den Knopf UND kommt durch (vorher 403)', async ({ page }) => {
    await login(page, KONTEN.makler.email, KONTEN.makler.pass)

    const knopf = page.getByRole('button', { name: SUPPORT_KNOPF })
    await expect(knopf, 'Partner muss den Support-Knopf sehen').toBeVisible({ timeout: 30_000 })
    console.log('[A] Support-Knopf für Makler sichtbar: ✓')

    // Antwort der Route abfangen — DAS ist die eigentliche Messung. Vor #5936 kam hier 403.
    const antwort = page.waitForResponse(
      (r) => r.url().includes('/api/support/chat') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )

    await knopf.click()
    const eingabe = page.getByRole('textbox').last()
    await expect(eingabe).toBeVisible({ timeout: 20_000 })
    await eingabe.fill('Regel-4-Smoke #5936 — bitte ignorieren. Prueft nur, ob die Partner-Rolle zugelassen ist.')
    await eingabe.press('Enter')

    const res = await antwort
    const status = res.status()
    console.log(`[A] POST /api/support/chat → HTTP ${status}`)
    if (status === 403) {
      const body = await res.text().catch(() => '')
      console.log(`[A] 403-Body: ${body.slice(0, 200)}`)
    }
    expect(status, 'Partner darf NICHT mehr in ein 403 laufen').not.toBe(403)
  })

  test('B · Endkunde sieht den Knopf nicht mehr (Gegenprobe)', async ({ page }) => {
    // Der Knopf hing zuletzt nur noch im MOBILEN Drawer — Desktop-Viewport würde ihn
    // ohnehin nicht zeigen und wäre ein wertloser grüner Test.
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, KONTEN.kunde.email, KONTEN.kunde.pass)

    // Drawer/Menü öffnen, falls vorhanden — der Knopf lag darin.
    const menue = page.getByRole('button', { name: /menü|menu|navigation|öffnen/i }).first()
    if (await menue.isVisible().catch(() => false)) {
      await menue.click()
      await page.waitForTimeout(1500)
    }

    const knopf = page.getByRole('button', { name: SUPPORT_KNOPF })
    const sichtbar = await knopf.isVisible().catch(() => false)
    const imMarkup = await knopf.count()
    console.log(`[B] Kunde – Support-Knopf sichtbar: ${sichtbar}, im Markup: ${imMarkup}`)
    expect(sichtbar, 'Ein Endkunde darf den Bugtracker-Knopf nicht mehr sehen').toBe(false)
  })
})
