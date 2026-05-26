import { test, expect } from '@playwright/test'

// Doc 46 Task 4: Drift-Schutz — die Service-Pitch-Kern-Hooks erscheinen auf
// allen drei Oberflächen (Hauptseite-HTML, llms.txt, llms-full.txt).
// Hinweis: die exakten 5 Bullet-Strings stehen verbatim nur im HTML + Voll-Dump;
// llms.txt (kuratierter Index) trägt sie verdichtet -> hier die surface-übergreifend
// konsistenten Kern-Hooks (Headline + Signatur-Phrasen).

test.describe('Service-Pitch Cross-Surface-Konsistenz', () => {
  const requiredHooks = [
    'Sie reden mit niemandem',
    'Ihr Fall. Immer in der Tasche',
    'Disponiert',
    '32 Tage',
  ]

  test('Hauptseite-HTML enthält alle Kern-Hooks', async ({ page }) => {
    await page.goto('/')
    for (const hook of requiredHooks) {
      await expect(page.getByText(hook).first()).toBeVisible()
    }
  })

  test('llms.txt enthält alle Kern-Hooks', async ({ page }) => {
    const text = await (await page.request.get('/llms.txt')).text()
    for (const hook of requiredHooks) {
      expect(text).toContain(hook)
    }
  })

  test('llms-full.txt enthält alle Kern-Hooks', async ({ page }) => {
    const text = await (await page.request.get('/llms-full.txt')).text()
    for (const hook of requiredHooks) {
      expect(text).toContain(hook)
    }
  })
})
