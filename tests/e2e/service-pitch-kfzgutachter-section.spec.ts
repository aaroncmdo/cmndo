import { test, expect } from '@playwright/test'

// Doc 45 Task 8: kfzgutachter-LP „Sie melden den Schaden"-Section geschärft.

test('kfzgutachter-LP „Sie melden den Schaden"-Section Headline geschärft', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.locator('h2', { hasText: 'Sie melden den Schaden. Wir reden mit der Versicherung.' }),
  ).toBeVisible()
})
