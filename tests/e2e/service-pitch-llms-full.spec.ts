import { test, expect } from '@playwright/test'

// Doc 46 Task 3: llms-full.txt Hauptseiten-Service-Pitch-Volltext (HAUPTSEITE_KERN
// in-place aktualisiert — kein zweiter Hauptseiten-Block).

test('llms-full.txt enthält Hauptseiten-Service-Pitch-Volltext', async ({ page }) => {
  const text = await (await page.request.get('/llms-full.txt')).text()
  expect(text).toContain('Sie reden mit niemandem. Wir mit allen.')
  // Plattform-Mechanik-Steps
  expect(text).toContain('Disponiert')
  expect(text).toContain('In der Tasche')
  expect(text).toContain('Kürzungs-Alarm')
  // Service-Realität-Cards
  expect(text).toContain('Ihr Fall. Immer in der Tasche')
  expect(text).toContain('Ein Berater. Eine Nummer. Immer dieselbe')
  // 6 USP-Cluster
  expect(text).toContain('Verantwortungs-Übergabe')
})
