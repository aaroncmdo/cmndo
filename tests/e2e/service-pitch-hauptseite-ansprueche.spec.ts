import { test, expect } from '@playwright/test'

// Doc 45 Task 3: ANSPRUECHE-Section auf Cluster-1 reframed.
// CardLink rendert <a> (kein <article>) — daher Text-basierte Assertions.

test('Hauptseite ANSPRUECHE-Section heißt "Vier Gespräche"', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#ansprueche-heading')).toContainText(
    'Vier Gespräche — wir führen sie, nicht Sie.',
  )
})

test('ANSPRUECHE-Cards sind auf "Wir verhandeln/setzen/holen" reframed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Wir verhandeln vollständige Erstattung/)).toBeVisible()
  await expect(page.getByText(/Wir setzen die Wertminderung/)).toBeVisible()
  await expect(page.getByText(/Wir holen Gutachter- und Anwaltskosten/)).toBeVisible()
})
