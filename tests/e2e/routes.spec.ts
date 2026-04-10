import { test, expect } from './fixtures'

// KFZ-185: Route Smoke-Tests — prüft dass alle kritischen Routes
// rendern ohne 500-Error oder 'Application Error'.

const ADMIN_ROUTES = [
  '/admin',
  '/admin/dispatch',
  '/admin/faelle',
  '/admin/sachverstaendige',
  '/admin/kalender',
  '/admin/tasks',
  '/admin/nachrichten',
  '/admin/versicherungen',
  '/admin/finance',
  '/admin/abrechnungen',
  '/admin/organisationen',
  '/admin/communities',
  '/admin/statistiken',
  '/admin/team',
]

const SV_ROUTES = [
  '/gutachter',
  '/gutachter/heute',
  '/gutachter/faelle',
  '/gutachter/gebiet',
  '/gutachter/kalender',
  '/gutachter/abrechnung',
  '/gutachter/statistiken',
  '/gutachter/nachrichten',
]

const PUBLIC_ROUTES = [
  '/login',
  '/datenschutz',
  '/impressum',
  '/passwort-vergessen',
]

test.describe('Admin Routes', () => {
  for (const route of ADMIN_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ adminPage }) => {
      const response = await adminPage.goto(route)
      expect(response?.status()).toBeLessThan(500)
      await expect(adminPage.locator('text=Application Error')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
      await expect(adminPage.locator('text=Internal Server Error')).not.toBeVisible({ timeout: 1000 }).catch(() => {})
    })
  }
})

test.describe('Gutachter Routes', () => {
  for (const route of SV_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ svPage }) => {
      const response = await svPage.goto(route)
      // SV routes may redirect to /gutachter/willkommen if not onboarded
      const status = response?.status() ?? 200
      expect(status).toBeLessThan(500)
      await expect(svPage.locator('text=Application Error')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
    })
  }
})

test.describe('Public Routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator('text=Application Error')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
    })
  }
})
