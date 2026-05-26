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
  await expect(page.getByText('Wir treiben die Versicherung in Verzug')).toBeVisible()
})

test('Task 12 — Schadensreport-Teaser zeigt Speed-Vergleich-Headline', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#schadensreport-teaser')).toContainText(
    '32 Tage. Branchen-Durchschnitt: 4–6 Monate.',
  )
})

test('Task 13 — Bottom-CTA zeigt Service-Pitch-Wording', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByText('Schicken Sie uns Ihren Fall — wir reden mit der Versicherung.'),
  ).toBeVisible()
})
