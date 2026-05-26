import { test, expect } from '@playwright/test'

// Doc 45 Task 2: Hauptseite-Hero auf Service-Pitch-Constants.
// Laeuft lokal gegen den Playwright-webServer (npm run dev) und in CI gegen Prod.

test('Hauptseite-Hero zeigt Service-Pitch-Cluster-1-Headline', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('#hero-heading')
  await expect(h1).toContainText('Sie reden mit niemandem')
  await expect(h1).toContainText('Wir mit allen')
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
