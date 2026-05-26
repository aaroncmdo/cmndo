import { test, expect } from '@playwright/test'

// Service-Pitch-Übertragung auf Stadt-Pages (Doc 44 §11): Hero-Bullets +
// Sub auf Service-Pitch — die SEO-kritische H1 "Kfz-Gutachter {Stadt}" bleibt.

test('Stadt-Page Köln: SEO-H1-Keyword bleibt erhalten', async ({ page }) => {
  await page.goto('/kfz-gutachter/koeln')
  const h1 = page.locator('#hero-heading')
  await expect(h1).toContainText('Kfz-Gutachter')
  await expect(h1).toContainText('Köln')
})

test('Stadt-Page Köln: Hero zeigt die Service-Realität-Bullets', async ({ page }) => {
  await page.goto('/kfz-gutachter/koeln')
  for (const label of [
    'Immer in der Tasche',
    'Ein Berater. Eine Nummer',
    '32 Tage statt 4 Monate',
    '0 € für Sie',
  ]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
  }
})
