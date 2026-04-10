import { test, expect } from '../fixtures'

// KFZ-185 Flow 5: Abrechnung-Cron Endpoint antwortet korrekt.

test('API: /api/cron/abrechnung-erstellen antwortet', async ({ request }) => {
  const cronSecret = process.env.CRON_SECRET ?? ''
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

  const response = await request.get(`${baseURL}/api/cron/abrechnung-erstellen`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  })

  // Should return 200 (skipped if not last day) or valid response
  expect(response.status()).toBeLessThan(500)
  const body = await response.json().catch(() => null)
  expect(body).toBeTruthy()
})
