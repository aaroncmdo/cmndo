import { test, expect } from '@playwright/test'

// Doc 45 Task 7: kfzgutachter-LP Hero auf Service-Pitch-Constants.
// H1 nutzt <br/> zwischen den Saetzen -> Substring-Checks statt kombiniertem String.

test('kfzgutachter-LP Hero zeigt Cluster-1-Headline mit Stadt-Insertion', async ({ page }) => {
  await page.goto('/kfzgutachter-lp?stadt=Köln')
  const h1 = page.locator('h1')
  await expect(h1).toContainText('Unfall in')
  await expect(h1).toContainText('Köln')
  await expect(h1).toContainText('Sie reden mit niemandem')
})

test('kfzgutachter-LP Hero ohne Stadt zeigt Fallback', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  const h1 = page.locator('h1')
  await expect(h1).toContainText('Sie hatten Unfall')
  await expect(h1).toContainText('Sie reden mit niemandem')
})

test('kfzgutachter-LP zeigt die 5 Service-Realität-Bullets (identisch zur Hauptseite)', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  for (const label of [
    'Immer in der Tasche',
    'Ein Berater. Eine Nummer',
    'jeden Brief, jeden Anruf, jeden Cent',
    '32 Tage statt 4 Monate',
    '0 € für Sie',
  ]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
  }
})
