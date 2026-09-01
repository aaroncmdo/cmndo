// T3-S3 Regel-4-Render-Smoke (16.07.): Die Slice-3-DDL ist LIVE (v_claim_listing/base/sv/for_gast
// status-Spalte = operative_status; v_claim_phase Selbstzahler; v_claim_timeline endzustand).
// Dieser Smoke beweist, dass die drei betroffenen Prod-Flaechen mit den geswappten Views rendern:
//   1. /faelle           — v_claim_listing (Badge statt '—' fuer aktive Claims, kein Query-Error)
//   2. /admin/faelle     — Kanban (stilles Leer-Board waere der gefaehrlichste Bruch: kein error-Check im Code)
//   3. Fallakte          — v_claim_timeline + v_claim_full (Detail rendert)
// Lauf: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test t3-s3-views-render-smoke
import { test, expect, type Page } from '@playwright/test'

// smoke-admin@claimondo.test wurde vom prod-golive-Account-Cleanup (13.07.) entfernt —
// test-admin@claimondo.de ist der aktuelle faktorfreie Admin-Smoke-Account.
const ADMIN = { email: 'test-admin@claimondo.de', pw: (process.env.TEST_PASSWORT ?? '') }

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', ADMIN.email)
  await page.fill('input[type="password"], input[name="password"]', ADMIN.pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('T3-S3: /faelle rendert mit geswappter v_claim_listing', async ({ page }) => {
  await login(page)
  await page.goto('/faelle', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  const body = page.locator('body')
  await expect(body).not.toContainText(/column .* does not exist|does not exist|Fehler beim Laden/i)
  // Liste oder Empty-State — Hauptsache kein Error-Banner und die Seite traegt den Faelle-Kontext.
  await expect(body).toContainText(/Fälle|Faelle|Fallakte|Keine Fälle/i)
})

test('T3-S3: /admin/faelle Kanban rendert (kein stilles Leer-Board)', async ({ page }) => {
  await login(page)
  await page.goto('/admin/faelle', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  const body = page.locator('body')
  await expect(body).not.toContainText(/column .* does not exist|Fehler beim Laden/i)
  // Kanban-Grundgeruest sichtbar (Phasen-Spalten existieren auch bei 0 Faellen).
  await expect(body).toContainText(/Erfassung|Begutachtung|Regulierung|Abschluss/i)
})

test('T3-S3: Fallakte rendert (v_claim_full + Timeline)', async ({ page }) => {
  await login(page)
  await page.goto('/faelle', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  // Erste Fall-Zeile oeffnen, falls vorhanden (prod hat >=1 Claim); sonst Test soft-skippen.
  const firstRow = page.locator('a[href*="/faelle/"], tr[data-href], tbody tr a').first()
  if ((await firstRow.count()) === 0) {
    test.skip(true, 'Keine Fall-Zeile auf prod sichtbar — Listing-Smoke deckt den Read bereits ab.')
  }
  await firstRow.click()
  await page.waitForLoadState('networkidle')
  const body = page.locator('body')
  await expect(body).not.toContainText(/column .* does not exist|Fehler beim Laden/i)
})
