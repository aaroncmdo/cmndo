import { test, expect } from '@playwright/test'

// Doc 45 Tasks 10-13: Hauptseite P1 Copy-Schärfungen.

test('Task 10 — Misstrauen-Headline geschärft', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#sorgen-heading')).toContainText('Wenn die Versicherung schreibt')
  await expect(page.locator('#sorgen-heading')).toContainText('Wir kümmern uns')
})

test('Task 11 — Prozess-Steps zeigen Team-Aktionen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Wir nehmen Ihren Schaden auf')).toBeVisible()
  await expect(page.getByText('Wir disponieren den Gutachter')).toBeVisible()
  await expect(page.getByText('Unsere Partnerkanzlei setzt die Versicherung in Verzug')).toBeVisible()
})

test('Task 12 — Schadensreport-Teaser Speed-Vergleich-Headline (genau einer, Dedup)', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#schadensreport-teaser')).toContainText(
    '32 Tage. Branchen-Durchschnitt: 4–6 Monate.',
  )
  // Doc 45 Dedup: inline report-heading-Block aus HauptseitePremium entfernt
  // -> genau EIN Schadensreport-Teaser auf / (nur noch die Component).
  await expect(page.locator('#report-heading')).toHaveCount(0)
  await expect(page.locator('#schadensreport-teaser')).toHaveCount(1)
})

// ⚠ HALBGEDANKENSTRICH (–, U+2013), nicht Geviertstrich (— U+2014) — zweiter Fall
// derselben Klasse wie in service-pitch-hauptseite-ansprueche.spec.ts. Der Wortlaut
// stimmte, nur das Zeichen nicht; der Test war dadurch rot, ohne dass an der Seite
// etwas fehlte. Quelle ist de.json, nicht die Typografie-Gewohnheit beim Tippen.
test('Task 13 — Bottom-CTA zeigt Service-Pitch-Wording', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByText('Schicken Sie uns Ihren Fall – wir reden mit der Versicherung.'),
  ).toBeVisible()
})
