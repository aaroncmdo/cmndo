// #4567 Reparatur-Funnel Regel-4-Prod-Smoke — Werkstatt-Portal-Drive.
// Fixture kommt aus scripts/smoke/reparatur-funnel-seed.mjs (Wegwerf-Werkstatt + kasko-Claim
// auf reparatur-laeuft, Termin bestaetigt). Dieser Test klickt den ECHTEN Werkstatt-Abschluss
// (markiereReparaturErledigt -> closeReparaturClaimViaEngine). Der harte DB-Beweis (Cursor-Walk +
// Timeline + phase_transitions + Provision) folgt via `node scripts/smoke/reparatur-funnel-seed.mjs --assert`.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test reparatur-funnel-abschluss-smoke --project=chromium
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// process.cwd() = Repo-Root beim playwright-Lauf (kein import.meta.url -> Playwright laedt
// Specs als CommonJS; import.meta.url wuerde sie in ESM zwingen und den Loader brechen).
// Fundament-B1-Härte: Seed-Fixture crash-sicher laden. Fehlt die Datei (Seed-Script nicht im
// e2e-Job gelaufen), skippt der Test sauber (s. test.skip unten) statt beim top-level readFileSync
// den GESAMTEN Playwright-Collection-Prozess zu brechen — ein fehlender Seed riss sonst den
// kompletten e2e-Lauf mit (inkl. der geseedeten J1-deep/reparatur-weg-Smokes).
let seed: any = null
try {
  seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-funnel-seed.json'), 'utf8'))
} catch { /* nicht geseedet -> test.skip im Test-Body */ }
const PDF = join(process.cwd(), 'tests/e2e/fixtures/test-upload.pdf')

test('Werkstatt schliesst Reparatur ab — Abschluss laeuft durch die Engine', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture .reparatur-funnel-seed.json fehlt (reparatur-funnel-seed.mjs läuft nicht im e2e-Job) — J4 wird vom geseedeten reparatur-weg-Trio abgedeckt')
  // 1) Login als Wegwerf-Werkstatt (frisches Konto -> kein 2FA, force_password_change=false)
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', seed.werkstattEmail)
  await page.fill('input[type="password"], input[name="password"]', seed.werkstattPw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

  // 2) Auftrag-Detail (v_werkstatt_auftrag-Sichtbarkeit vorab per SQL bewiesen)
  await page.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  // 3) Abschluss-Trigger (erscheint nur bei reparatur_termin_status='bestaetigt')
  const trigger = page.getByRole('button', { name: 'Reparatur abschließen' }).first()
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  await trigger.click()

  // 4) Modal: Schlussrechnung hochladen + absenden
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.locator('#reparatur-abschluss-datei').setInputFiles(PDF)
  await dialog.getByRole('button', { name: 'Reparatur abschließen' }).click()

  // 5) Erfolg: Success-Toast (harter DB-Beweis folgt via --assert)
  await expect(page.getByText('Reparatur abgeschlossen', { exact: false })).toBeVisible({ timeout: 25_000 })
})
