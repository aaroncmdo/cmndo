import { test, expect } from '@playwright/test'

// Doc 41 §9.3 — verifiziert die Card-as-Link-Umstellung (PR2/PR3/PR8).
// Relative Pfade => nutzt playwright.config baseURL (default localhost:3000,
// in CI via PLAYWRIGHT_BASE_URL auf die Deployment-URL gesetzt). Die Asserts
// werden erst gruen, wenn PR2/PR3/PR8 auf der Ziel-Umgebung deployed sind
// (e2e laeuft gegen den deployten Stand, nicht gegen den PR-Branch).

test.describe('Doc 41 — Card-Links', () => {
  test('ANSPRUECHE-Cards (Hauptseite) fuehren zu Haftpflicht-Spokes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const cards = page.getByRole('link', { name: /Anspruch im Detail/i })
    await expect(cards).toHaveCount(4)
    const hrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    expect(hrefs).toContain('/haftpflicht/reparaturkosten')
    expect(hrefs).toContain('/haftpflicht/wertminderung')
    expect(hrefs).toContain('/haftpflicht/nutzungsausfall')
    expect(hrefs).toContain('/kosten-kfz-gutachten')
  })

  test('BGH-Authority-Cards (Hauptseite): 7 von 8 verlinkt', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // 7 klickbare BGH-Cards; VI ZR 67/91 (130%-Regel) bewusst ohne Link (§3.1).
    const bghLinks = page.locator('a[aria-label*="BGH VI ZR"]')
    await expect(bghLinks).toHaveCount(7)
  })

  test('Hotspot-Cards (Duesseldorf) fuehren zur Pillar-B-Cornerstone', async ({ page }) => {
    await page.goto('/kfz-gutachter/duesseldorf', { waitUntil: 'domcontentloaded' })
    const hotspots = page.locator(
      'a[href="/unfall-was-tun-als-geschaedigter"][data-tracking^="card-hotspot-duesseldorf"]',
    )
    // Anzahl ist datenabhaengig (HYPERLOCAL_DATA) -> robust auf >= 1 pruefen.
    expect(await hotspots.count()).toBeGreaterThan(0)
  })
})
