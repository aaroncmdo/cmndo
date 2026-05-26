import { test, expect } from '@playwright/test'

// Doc 45 Task 21: Cross-Page Brand-Konsistenz zwischen claimondo.de Hauptseite
// und kfzgutachter.claimondo.de — die zentrale service-pitch.ts haelt beide synchron.

test.describe('Service-Pitch Brand-Konsistenz', () => {
  const BULLETS = [
    'Ihr Fall. Immer in der Tasche.',
    'Ein Berater. Eine Nummer. Immer dieselbe.',
    'Sie sehen jeden Brief, jeden Anruf, jeden Cent.',
    '32 Tage statt 4 Monate. Im Schnitt.',
    '0 € für Sie. (§ 249 BGB).',
  ]

  test('Beide Seiten zeigen identische 5 Service-Realität-Bullets', async ({ page }) => {
    await page.goto('/')
    for (const label of BULLETS) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
    await page.goto('/kfzgutachter-lp')
    for (const label of BULLETS) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test('Hero-Headline-Pattern „Sie reden mit niemandem" auf beiden Seiten', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#hero-heading')).toContainText('Sie reden mit niemandem')

    await page.goto('/kfzgutachter-lp?stadt=Köln')
    await expect(page.locator('h1')).toContainText('Sie reden mit niemandem')
  })

  test('Hauptseite hat ServiceRealitaet + PlattformMechanik, LP nicht (kondensiert)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#service-realitaet-heading')).toBeVisible()
    await expect(page.locator('#plattform-mechanik-heading')).toBeVisible()

    await page.goto('/kfzgutachter-lp')
    await expect(page.locator('#service-realitaet-heading')).toHaveCount(0)
    await expect(page.locator('#plattform-mechanik-heading')).toHaveCount(0)
  })
})
