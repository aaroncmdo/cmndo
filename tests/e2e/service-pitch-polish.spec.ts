import { test, expect } from '@playwright/test'

// Doc 45 Tasks 19-20: Polish.

// Task 19 (Hero-Band „Adrenalin geht. Anspruch bleibt." unter `#hero-band-quote`) ist
// ersatzlos ENTFALLEN: Das Home-Premium-Rework (#2199, 01.06.) hat das Band von der
// Hauptseite genommen. Gemessen 26.08.: `#hero-band-quote` existiert dort nicht mehr
// (0 Elemente), und die einzigen verbliebenen Band-/Zitat-IDs sind `team-band-heading`.
//
// Der Test wurde deshalb entfernt statt umgeschrieben — es gibt nichts mehr abzusichern.
// ⚠ Der i18n-Block `hauptseite.hero_band` (quote_plain/quote_accent) steht noch in
// de.json, wird aber von keinem Build mehr gelesen: toter Content, kein Rendering-Bug.
// Wer das Band zurückholt, bringt Test UND Key gemeinsam zurück.

test('Task 20 — kfzgutachter-LP 3-Step-Headline „Disponiert. Verhandelt. Ausgezahlt."', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.locator('h2', { hasText: 'Disponiert. Verhandelt. Ausgezahlt.' }),
  ).toBeVisible()
})
