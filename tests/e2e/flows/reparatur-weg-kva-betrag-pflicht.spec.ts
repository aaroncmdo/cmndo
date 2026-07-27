// Regressions-Test für den KVA-Betrag-Pflicht-Fix (KvaHochladenModal): ein Kostenvoranschlag
// ohne Betrag ist nicht speicherbar, denn sonst bekommt der Kunde keine Freigabe
// (kvaSichtbar = netto||brutto) → stiller Deadlock (Regel-4-Smoke 27.07.).
// Ausgangszustand aus scripts/smoke/reparatur-weg-e2e-seed.mjs.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=<host> npx playwright test reparatur-weg-kva-betrag-pflicht --project=chromium
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'))
const PDF = join(process.cwd(), 'tests/e2e/fixtures/test-upload.pdf')

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('KVA-Betrag ist Pflicht: Speichern blockt ohne Betrag, geht mit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, seed.werkstattEmail, seed.werkstattPw)
  await page.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Kostenvoranschlag hochladen' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  await page.locator('#auftrag-kva-datei').setInputFiles(PDF)
  await expect(page.getByText('KVA wird ausgelesen')).toBeHidden({ timeout: 40_000 })
  // Beträge leeren (falls OCR etwas eintrug) → Kanten-Fall
  await page.locator('input[name="auftrag-kva-netto"]').fill('')
  await page.locator('input[name="auftrag-kva-brutto"]').fill('')
  await page.locator('#auftrag-kva-termin').fill('2026-09-15T10:00')

  const save = dialog.getByRole('button', { name: 'Speichern' })
  // FIX: ohne Betrag NICHT speicherbar + erklärender Hinweis
  await expect(save).toBeDisabled()
  await expect(dialog.getByText('benötigt ihn für die Freigabe', { exact: false })).toBeVisible()

  // Mit Betrag: speicherbar
  await page.locator('input[name="auftrag-kva-brutto"]').fill('2500')
  await expect(save).toBeEnabled()
})
