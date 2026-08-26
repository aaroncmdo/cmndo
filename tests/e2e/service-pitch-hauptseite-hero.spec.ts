import { test, expect } from '@playwright/test'

// Doc 45 Task 2: Hauptseite-Hero auf Service-Pitch-Constants.
// Laeuft lokal gegen den Playwright-webServer (npm run dev) und in CI gegen Prod.

// Doc 45 setzte hier die Cluster-1-Headline „Sie reden mit niemandem. Wir mit allen."
// Das Home-Premium-Rework (#2199, 01.06.) hat den Hauptseiten-Hero ersetzt; die
// Cluster-1-Headline lebt weiter auf /kfzgutachter-lp (siehe service-pitch-konsistenz).
//
// Der Test prüft deshalb nicht mehr den alten Wortlaut, sondern die ABSICHT dahinter:
// der Hero muss die Kernbotschaft tragen, dass die Kanzlei verhandelt und nicht der
// Kunde. Nach dem Rework steht sie in der Sub-Headline statt in der H1.
test('Hauptseite-Hero trägt Headline + Service-Pitch-Kernbotschaft', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('#hero-heading')
  await expect(h1).toContainText('Unverschuldet im Unfall?')
  await expect(h1).toContainText("Wir haben's im Griff.")
  await expect(
    page.getByText(/Partnerkanzlei verhandelt mit der gegnerischen Versicherung/).first(),
  ).toBeVisible()
})

test('Hauptseite-Hero zeigt 5 Service-Realität-Bullets', async ({ page }) => {
  await page.goto('/')
  const bullets = page.locator('#hero-heading ~ ul li')
  await expect(bullets).toHaveCount(5)
  await expect(bullets.nth(0)).toContainText('in der Tasche')
  await expect(bullets.nth(1)).toContainText('Ein Berater. Eine Nummer')
  await expect(bullets.nth(4)).toContainText('0 €')
})

test('Hauptseite-Hero hat den primären Wizard-CTA auf /gutachter-finden', async ({ page }) => {
  await page.goto('/')
  const cta = page.locator('[data-tracking="hero-wizard-cta"]')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/gutachter-finden')
  await expect(cta).toContainText('Versicherung reden')
})
