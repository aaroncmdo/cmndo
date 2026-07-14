// Run: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/portal-header-phase2.spec.ts
//
// Prod-Smoke (Regel 4 — Verhalten gegen prod, nicht nur build-gruen) fuer Portal-Header Phase 2:
// die zuvor HAND-GEROLLTEN Seiten-Header (<h1 class="text-heading-lg font-bold text-claimondo-navy">)
// nutzen jetzt den shared PageHeader und tragen damit die Floating-Card ([data-page-header-card]).
//
// Phase 1 (pageheader-floating-card.spec.ts) deckt die BESTEHENDEN PageHeader-Consumer ab.
// Dieser Spec deckt die in Phase 2 NEU migrierten Seiten ab — v.a. KB/mitarbeiter, das vorher
// PageHeader 0x nutzte (der Kern-Gap).
//
// Interne Rollen brauchen 2FA (TOTP-Secret via env); ohne Secret skippt der Test graceful.
// Hinweis: nach dem Prod-Go-Live-Cleanup (13.07.) koennen Test-Accounts fehlen -> Tests skippen
// dann statt rot zu werden. Ein Skip ist KEIN gruener Smoke — Accounts ggf. neu seeden.
import { test, expect } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { loginContextOrSkip, skipIfAuthWall } from './_golden-path-lib'

/** Der Header ist eine Floating-Card und steckt in KEINEM eckigen bg-white/border-b-Band. */
async function expectFloatingCard(card: Locator, path: string): Promise<void> {
  await expect(card, `Floating-Card auf ${path}`).toBeVisible({ timeout: 10_000 })
  await expect(card, `page-header-card-Klasse auf ${path}`).toHaveClass(/page-header-card/)
  const hasBandAncestor = await card.evaluate((el) => {
    let node: HTMLElement | null = el.parentElement
    for (let i = 0; i < 4 && node; i++) {
      const c = node.className || ''
      if (/bg-white/.test(c) && /border-b/.test(c)) return true
      node = node.parentElement
    }
    return false
  })
  expect(hasBandAncestor, `kein eckiges bg-white/border-b-Band um den Header auf ${path}`).toBeFalsy()
}

// Pro Rolle die in Phase 2 migrierten Seiten (Auswahl, repraesentativ je Portal).
const PAGES_BY_ROLE = {
  // KB = der Kern-Gap (nutzte vorher PageHeader 0x).
  kb: ['/mitarbeiter/faelle', '/mitarbeiter/tasks', '/mitarbeiter/termine', '/mitarbeiter/reklamationen'],
  admin: ['/admin/einstellungen', '/admin/team', '/admin/organisationen', '/admin/sla'],
  dispatch: ['/dispatch/rueckrufe', '/dispatch/kalender', '/dispatch/gutachter-finder'],
} as const

test.describe('Portal-Header Phase 2 — hand-gerollt -> shared PageHeader', () => {
  for (const [role, paths] of Object.entries(PAGES_BY_ROLE)) {
    test(`${role}: migrierte Seiten-Header rendern als Floating-Card`, async ({ browser }) => {
      const ctx = await loginContextOrSkip(browser, role as 'kb' | 'admin' | 'dispatch')
      const page = await ctx.newPage()
      try {
        for (const path of paths) {
          await page.goto(path, { waitUntil: 'domcontentloaded' })
          skipIfAuthWall(page)
          await expectFloatingCard(page.locator('[data-page-header-card]').first(), path)
        }
      } finally {
        await ctx.close()
      }
    })
  }

  // Regression fuer den Review-Fund: die 5 Kalender-Controls lagen zuerst in PageHeaders
  // `actions`-Slot (flex, shrink-0, KEIN flex-wrap) -> auf dem Handy waeren sie horizontal
  // uebergelaufen. Fix: Toolbar in `children` (volle Breite, flex-wrap). Hier festgenagelt.
  test('dispatch/kalender: Header-Toolbar laeuft auf 375px NICHT horizontal ueber', async ({ browser }) => {
    const ctx = await loginContextOrSkip(browser, 'dispatch')
    const page = await ctx.newPage()
    try {
      await page.setViewportSize({ width: 375, height: 800 })
      await page.goto('/dispatch/kalender', { waitUntil: 'domcontentloaded' })
      skipIfAuthWall(page)
      await expectFloatingCard(page.locator('[data-page-header-card]').first(), '/dispatch/kalender')

      // Die Card selbst darf nicht breiter sein als der Viewport (sonst Overflow/Clipping).
      const overflowPx = await page
        .locator('[data-page-header-card]')
        .first()
        .evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflowPx, 'Header-Card scrollt horizontal (Toolbar passt nicht)').toBeLessThanOrEqual(1)

      // Alle 5 Controls muessen weiterhin da (und sichtbar) sein — nichts darf beim
      // Umhaengen actions -> children verloren gegangen sein.
      const card = page.locator('[data-page-header-card]').first()
      await expect(card.getByRole('button', { name: 'Vorherige Woche' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Nächste Woche' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Heute' })).toBeVisible()
      await expect(card.getByRole('button', { name: /SV-Filter/ })).toBeVisible()
      await expect(card.getByRole('button', { name: /Spontan-Termin/ })).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
