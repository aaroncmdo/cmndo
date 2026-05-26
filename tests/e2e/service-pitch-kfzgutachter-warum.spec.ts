import { test, expect } from '@playwright/test'

// Doc 45 Task 9: WarumCards auf Cluster 1+6 reframed (BGH-Belege erhalten).
// Card-Titel sind in den Tab-Buttons immer sichtbar.

test('WarumCards enthält Cluster-1+6-Aussagen', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(page.getByText('Disponiert statt vermittelt', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Wir reden mit der Versicherung', { exact: false }).first()).toBeVisible()
})
