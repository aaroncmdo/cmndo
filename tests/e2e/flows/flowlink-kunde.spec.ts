import { test, expect } from '../fixtures'

// KFZ-185 Flow 2: FlowLink öffnen → Seite rendert korrekt.

test('Public: FlowLink Page lädt', async ({ page }) => {
  // Flow page with invalid token should show error gracefully, not 500
  const response = await page.goto('/flow/test-invalid-token')
  const status = response?.status() ?? 200
  // Expect 404 or redirect, but NOT 500
  expect(status).toBeLessThan(500)
})
