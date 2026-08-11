// Behavioral-Smoke (operatives Soll): Im Kasko/Selbstzahler-/flow wird der Kunde jetzt nach der
// Schaden-Beschreibung GEFRAGT. Mig 20260801163119 nahm unfallhergang ins feststellung-erhebt_felder-
// Gate auf -> ein Selbstzahler-Lead mit kennzeichen+schadentyp aber OHNE unfallhergang sieht den
// Feststellungs-Step (Screen "Wie ist es passiert?"), waehrend er mit unfallhergang uebersprungen wird.
// Der Kontrast (A vs B, nur unfallhergang unterschiedlich) isoliert das neue Gate-Feld.
// Hinweis (Aaron-Entscheid a): der Wizard ERZWINGT das Ausfuellen nicht ("nichts ist Pflicht"-Design) —
// bewiesen wird "der Kunde wird gefragt" (Step erscheint), nicht "harte Blockade".
// Anonym (Magic-Link, kein Login). Ausgangszustand aus scripts/smoke/feststellung-flow-gate-seed.mjs.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test feststellung-flow-gate --project=chromium
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fundament-B1-Haerte (gleiches Muster wie reparatur-funnel-abschluss-smoke.spec.ts): Seed-Fixture
// crash-sicher laden. Fehlt die Datei, skippen die Tests sauber (s. test.skip unten) statt beim
// top-level readFileSync den GESAMTEN Playwright-Collection-Prozess zu brechen -- ein fehlender Seed
// riss sonst den kompletten e2e-Lauf mit (inkl. der geseedeten Journey-Smokes).
// Der Generator scripts/smoke/feststellung-flow-gate-seed.mjs ist local-only (hardcodierter
// .env.local-Pfad, seedet prod) und laeuft bewusst NICHT im e2e-Job -> in CI wird geskippt.
let seed: any = null
try {
  seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.feststellung-flow-gate-seed.json'), 'utf8'))
} catch { /* nicht geseedet -> test.skip im Test-Body */ }

const SEED_FEHLT = 'Seed-Fixture .feststellung-flow-gate-seed.json fehlt — local-only Prod-Smoke (scripts/smoke/feststellung-flow-gate-seed.mjs), laeuft nicht im e2e-Job'

// Summary-Step (Step 0): Datenschutz-Checkbox + Weiter. vorname/nachname sind geseedet (non-empty).
async function passiereSummaryStep(page: Page) {
  await page.getByRole('checkbox').first().check()
  const weiter = page.getByRole('button', { name: 'Weiter', exact: true })
  await expect(weiter).toBeEnabled({ timeout: 15_000 })
  await weiter.click()
}

test('Gate positiv: Lead OHNE unfallhergang bekommt den Hergang-Step gezeigt', async ({ page }) => {
  test.skip(!seed, SEED_FEHLT)
  test.setTimeout(90_000)
  await page.goto(`/flow/${seed.tokenA}`, { waitUntil: 'domcontentloaded' })
  await passiereSummaryStep(page)
  // Feststellung wird betreten (skip-all-Button = Feststellungs-Sub-Wizard-Indikator).
  await expect(page.locator('[data-testid="feststellung-skip-all"]')).toBeVisible({ timeout: 20_000 })
  // Im Sub-Wizard "Weiter", bis der unfallhergang-Screen sichtbar ist (Reihenfolge nicht hardcoden).
  const hergang = page.locator('[data-testid="feld-unfallhergang"]')
  await expect(async () => {
    if (!(await hergang.isVisible())) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    }
    await expect(hergang).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Wie ist es passiert?' })).toBeVisible()
})

test('Gate negativ: Lead MIT unfallhergang ueberspringt die Feststellung (Gate ist unfallhergang-spezifisch)', async ({ page }) => {
  test.skip(!seed, SEED_FEHLT)
  test.setTimeout(90_000)
  await page.goto(`/flow/${seed.tokenB}`, { waitUntil: 'domcontentloaded' })
  await passiereSummaryStep(page)
  // unfallhergang gefuellt -> die Feststellung faellt aus der aktiven Step-Liste. Der Flow geht direkt
  // zum naechsten Step; weder der skip-all-Button noch das unfallhergang-Feld duerfen je erscheinen.
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(6_000) // dem Flow Zeit geben, den naechsten Step zu laden
  await expect(page.locator('[data-testid="feststellung-skip-all"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="feld-unfallhergang"]')).toHaveCount(0)
})
