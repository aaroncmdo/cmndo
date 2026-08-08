import { test, expect } from '../fixtures'

// GEO-P2 SP1 (Kürzungs-Capture) — Regression-Guard.
// Assertion: die Kürzungspositionen-Subform ist im "VS kürzt"-Modal erreichbar + gerendert.
// Bewusst RENDER-only (kein Submit) → keine Mutation je CI-Lauf. Der Write-Pfad selbst ist
// unit-getestet (src/lib/kanzlei-fall/kuerzungs-positionen.test.ts) + manuell prod-gesmoked
// (08.08.: forderungspositionen upe=200/verbringung=150/quelle=vs_kuerzung, CLM-2026-00837).
// Guard-Zweck: fällt an, falls die Subform / der Prozess-Tab / das Modal verschwindet.

const TEST_CLAIM = 'fbc10004-0000-4000-8000-000000000004' // CLM-2026-00837 (synthetische Test-Fixture)

test('SP1: "VS kürzt"-Modal zeigt die Kürzungspositionen-Subform', async ({ adminPage: page }) => {
  await page.goto(`/faelle/${TEST_CLAIM}?tab=prozess`)
  await page.getByRole('button', { name: /VS kürzt/ }).first().click()

  // Pflicht-Radio (vs_kuerzungs_typ) + die neue Subform + eine gekürzt-Zelle
  await expect(page.locator('input[name="vs_kuerzungs_typ"][value="technisch"]')).toBeVisible()
  await expect(page.getByText('Kürzungspositionen')).toBeVisible()
  await expect(page.getByText('UPE-Aufschläge')).toBeVisible()
  await expect(page.getByPlaceholder('gekürzt').first()).toBeVisible()
})
