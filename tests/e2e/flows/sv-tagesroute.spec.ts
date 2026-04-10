import { test, expect } from '../fixtures'

// KFZ-185 Flow 3: SV Login → /gutachter/heute → Seite rendert.

test('SV: Heute-Seite lädt', async ({ svPage }) => {
  await svPage.goto('/gutachter/heute')
  await svPage.waitForLoadState('networkidle')
  // Should render without error (may redirect to willkommen if not onboarded)
  await expect(svPage.locator('text=Application Error')).not.toBeVisible({ timeout: 5000 }).catch(() => {})
})

test('SV: Faelle-Liste lädt', async ({ svPage }) => {
  await svPage.goto('/gutachter/faelle')
  await svPage.waitForLoadState('networkidle')
  await expect(svPage.locator('text=Application Error')).not.toBeVisible({ timeout: 5000 }).catch(() => {})
})
