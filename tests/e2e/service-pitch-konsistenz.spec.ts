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

  // Doc 45 wollte dieses Hero-Pattern auf BEIDEN Seiten. Das Home-Premium-Rework
  // (#2199, 01.06.) hat den Hauptseiten-Hero bewusst auf eine eigene Headline gedreht
  // („Unverschuldet im Unfall? / Wir haben's im Griff."), die LP behielt Cluster 1.
  // Die Seiten sind hier also absichtlich verschieden — der Test prüft das Pattern
  // deshalb nur noch dort, wo es gilt, und hält die Abweichung fest, statt sie als
  // Fehler zu melden. Der Hauptseiten-Hero wird in service-pitch-hauptseite-hero geprüft.
  test('Hero-Headline-Pattern „Sie reden mit niemandem" auf der kfzgutachter-LP', async ({
    page,
  }) => {
    await page.goto('/kfzgutachter-lp?stadt=Köln')
    await expect(page.locator('h1')).toContainText('Sie reden mit niemandem')

    // Gegenprobe: die Hauptseite trägt bewusst ihre eigene Headline.
    await page.goto('/')
    await expect(page.locator('#hero-heading')).not.toContainText('Sie reden mit niemandem')
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
