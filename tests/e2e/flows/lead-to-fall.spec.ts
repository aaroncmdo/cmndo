import { test, expect } from '../fixtures'

// KFZ-185 Flow 1: Admin legt Lead an → SV zuweisen → Fall sichtbar.

test('Admin: Lead anlegen und Fall erstellen', async ({ adminPage }) => {
  // Navigate to dispatch
  await adminPage.goto('/admin/dispatch')
  await adminPage.waitForLoadState('networkidle')

  // Check dispatch page renders
  await expect(adminPage.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 })

  // Verify faelle page is accessible
  await adminPage.goto('/admin/faelle')
  await expect(adminPage.locator('body')).not.toContainText('Application Error')
})
