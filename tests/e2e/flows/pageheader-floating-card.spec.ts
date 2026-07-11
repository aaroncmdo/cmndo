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
        // Negativ: KEIN Vorfahre im Header-Bereich traegt gleichzeitig bg-white + border-b
        // (eckiges Band). Bis zu 4 Ebenen hoch pruefen — das Band kann Layout-Wrapper sein
        // (Grosseltern), nicht nur der direkte Parent.
        const hasBandAncestor = await card.evaluate((el) => {
          let node: HTMLElement | null = el.parentElement
          for (let i = 0; i < 4 && node; i++) {
            const c = node.className || ''
            if (/bg-white/.test(c) && /border-b/.test(c)) return true
            node = node.parentElement
          }
          return false
        })
        expect(
          hasBandAncestor,
          `kein eckiges bg-white/border-b-Band um den Header auf ${path}`,
        ).toBeFalsy()
      }
    } finally {
      await ctx.close()
    }
  })
})
