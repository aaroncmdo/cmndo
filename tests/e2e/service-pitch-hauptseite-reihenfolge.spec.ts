import { test, expect } from '@playwright/test'

// Doc 45 Task 6: Hauptseite Section-Reihenfolge nach Doc 44.
// ANSPRUECHE -> Service-Realität -> Berater -> Plattform-Mechanik -> Misstrauen.

test('Hauptseite Sections in neuer Reihenfolge', async ({ page }) => {
  await page.goto('/')
  const ariaLabels = await page
    .locator('section[aria-labelledby]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')))

  const idx = (id: string) => ariaLabels.indexOf(id)

  expect(idx('ansprueche-heading')).toBeGreaterThan(-1)
  expect(idx('service-realitaet-heading')).toBeGreaterThan(idx('ansprueche-heading'))
  expect(idx('berater-heading')).toBeGreaterThan(idx('service-realitaet-heading'))
  expect(idx('plattform-mechanik-heading')).toBeGreaterThan(idx('berater-heading'))
  expect(idx('sorgen-heading')).toBeGreaterThan(idx('plattform-mechanik-heading'))
})
