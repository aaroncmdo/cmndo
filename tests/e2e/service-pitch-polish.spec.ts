import { test, expect } from '@playwright/test'

// Doc 45 Tasks 19-20: Polish.

test('Task 19 — Hero-Band-Power-Hook auf der Hauptseite', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#hero-band-quote')).toContainText('Adrenalin geht. Anspruch bleibt.')
})

test('Task 20 — kfzgutachter-LP 3-Step-Headline „Disponiert. Verhandelt. Ausgezahlt."', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.locator('h2', { hasText: 'Disponiert. Verhandelt. Ausgezahlt.' }),
  ).toBeVisible()
})
