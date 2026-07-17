// Kasko/Selbstzahler-Fix Regel-4-Smoke (17.07., READ-only): Fallakte des Live-Belegs
// 39734007 (SMOKE-E2E-1607-Fixture, KEINE Mutation!) muss nach #4471-Deploy die
// Reparatur-Lane zeigen (Werkstatt gesetzt -> "Reparaturtermin ..."), NICHT mehr
// "SA-Unterschrift offen" (der alte leadSubphase-Fallback).
// Lauf: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test kasko-reparatur-phase-smoke
import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'test-admin@claimondo.de', pw: 'Claimondo2026!' }
const KASKO_CLAIM = '39734007-2680-44b9-b05a-4c317ae10bc7'

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', ADMIN.email)
  await page.fill('input[type="password"], input[name="password"]', ADMIN.pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Kasko-Fallakte zeigt Reparatur-Lane statt "SA-Unterschrift offen"', async ({ page }) => {
  await login(page)
  await page.goto(`/faelle/${KASKO_CLAIM}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  const body = page.locator('body')
  await expect(body).not.toContainText(/SA-Unterschrift offen/i)
  // Stepper-Label (reparatur_terminfindung) ODER ActionBar r.2 — beide tragen "Reparaturtermin".
  await expect(body).toContainText(/Reparaturtermin|Werkstatt wählen|Reparatur/)
})
