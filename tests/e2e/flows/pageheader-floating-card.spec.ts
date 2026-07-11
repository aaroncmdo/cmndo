// Run: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/pageheader-floating-card.spec.ts --headed
//
// Smoke (Aaron-Mandat 11.07. — Verhalten gegen prod, nicht nur build-gruen):
// Der shared PageHeader rendert auf repraesentativen Portal-Seiten als weiche
// Floating-Card (.page-header-card / [data-page-header-card]) — statt der frueheren
// eckigen `bg-white border-b`-Leiste. Interne Rollen brauchen 2FA (TOTP-Secret via
// env; ohne skippt der Test graceful). Post-merge laeuft die Suite in CI gegen
// app.claimondo.de.
import { test, expect } from '@playwright/test'
import { loginContextOrSkip, skipIfAuthWall } from './_golden-path-lib'

// Admin-Seiten, deren Seiten-Header die Floating-Card tragen (standalone Header).
// (NICHT /admin/statistiken — dort ist der Titel bewusst `bare`, inline in der Filter-Bar.)
const ADMIN_CARD_PAGES = [
  '/admin/finance',
  '/admin/faelle',
  '/admin/sachverstaendige/basic-freigaben',
]

test.describe('PageHeader Floating-Card', () => {
  test('admin: Seiten-Header rendert als Floating-Card (kein eckiges bg-white/border-b-Band)', async ({
    browser,
  }) => {
    const ctx = await loginContextOrSkip(browser, 'admin')
    const page = await ctx.newPage()
    try {
      for (const path of ADMIN_CARD_PAGES) {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        skipIfAuthWall(page)
        // Card-Surface aktiv: mind. eine [data-page-header-card] sichtbar + traegt die Klasse.
        const card = page.locator('[data-page-header-card]').first()
        await expect(card, `Floating-Card auf ${path}`).toBeVisible({ timeout: 10_000 })
        await expect(card).toHaveClass(/page-header-card/)
        // Negativ: der Header steckt nicht mehr in einer eckigen Band-Leiste — der
        // direkte Eltern-Wrapper darf keine bg-white + border-b-Kombination tragen.
        const parentBandClass = await card.evaluate((el) => el.parentElement?.className ?? '')
        expect(
          /bg-white/.test(parentBandClass) && /border-b/.test(parentBandClass),
          `kein eckiges Band um den Header auf ${path} (parent="${parentBandClass}")`,
        ).toBeFalsy()
      }
    } finally {
      await ctx.close()
    }
  })
})
