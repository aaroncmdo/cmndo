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
const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-funnel-seed.json'), 'utf8'))
const PDF = join(process.cwd(), 'tests/e2e/fixtures/test-upload.pdf')

test('Werkstatt schliesst Reparatur ab — Abschluss laeuft durch die Engine', async ({ page }) => {
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
