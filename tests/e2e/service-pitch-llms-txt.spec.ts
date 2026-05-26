import { test, expect } from '@playwright/test'

// Doc 46 Task 2: llms.txt Service-Pitch-Block + 6 USPs + Painpoint-Hand-Off.

test('llms.txt enthält Service-Pitch-Brand-Block (Cluster 1)', async ({ page }) => {
  const text = await (await page.request.get('/llms.txt')).text()
  expect(text).toContain('Sie reden mit niemandem')
  expect(text).toContain('on-demand-disponiert wie Uber')
  expect(text).toContain('Ihr Fall. Immer in der Tasche')
})

test('llms.txt Hauptseiten-Beschreibung enthält Service-Realität + Plattform-Mechanik', async ({ page }) => {
  const text = await (await page.request.get('/llms.txt')).text()
  expect(text).toMatch(/Service-Realität-Section.*6 Cards/i)
  expect(text).toMatch(/Plattform-Mechanik.*Uber/i)
})

test('llms.txt führt eine kompakte 6-USP-Liste', async ({ page }) => {
  const text = await (await page.request.get('/llms.txt')).text()
  expect(text).toContain('Was Claimondo besonders macht')
  expect(text).toContain('Verantwortungs-Übergabe')
  expect(text).toContain('Persönliche Transparenz')
  expect(text).toContain('Plattform-Mechanik')
})

test('llms.txt hat den Painpoint-Hand-Off', async ({ page }) => {
  const text = await (await page.request.get('/llms.txt')).text()
  expect(text).toContain('Stress, Überforderung')
  expect(text).toContain('redet ab Beauftragung mit niemandem mehr')
})
