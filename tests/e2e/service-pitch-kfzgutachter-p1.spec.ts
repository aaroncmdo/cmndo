import { test, expect } from '@playwright/test'

// Doc 45 Tasks 14-18: kfzgutachter-LP P1 Copy-Schärfungen.

test('Task 14 — TrustBar erwähnt VS-Kommunikation', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.getByText(/VS-Kommunikation|Versicherer-Kommunikation/i).first(),
  ).toBeVisible()
})

test('Task 15 — „Warum NIE der Versicherer-Gutachter"-Headline', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.locator('h2', { hasText: 'Warum NIE der Versicherer-Gutachter' }),
  ).toBeVisible()
})

test('Task 16 — NRW-Steps zeigen Plattform-Mechanik-Wording', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(page.getByText(/disponieren binnen Stunden/i)).toBeVisible()
})

test('Task 17 — FAQ erste Q ist „Wer redet mit der Versicherung?"', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(page.locator('details summary').first()).toContainText(
    'Wer redet mit der Versicherung',
  )
})

test('Task 18 — Bottom-CTA Service-Pitch', async ({ page }) => {
  await page.goto('/kfzgutachter-lp')
  await expect(
    page.getByText('Wir reden mit der Versicherung — Sie atmen'),
  ).toBeVisible()
})
