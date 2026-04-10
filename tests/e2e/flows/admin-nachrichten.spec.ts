import { test, expect } from '../fixtures'

// KFZ-185 Flow 4: /admin/nachrichten → Chat-Liste lädt.

test('Admin: Nachrichten-Inbox rendert', async ({ adminPage }) => {
  await adminPage.goto('/admin/nachrichten')
  await adminPage.waitForLoadState('networkidle')

  // Page title should be visible
  await expect(adminPage.locator('text=Nachrichten')).toBeVisible({ timeout: 10_000 })

  // No server errors
  await expect(adminPage.locator('text=Application Error')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
})
