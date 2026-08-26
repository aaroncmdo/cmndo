import { test, expect } from '@playwright/test'

// Doc 45 Task 6 prüfte die Doc-44-Reihenfolge
// (ANSPRUECHE -> Service-Realität -> Berater -> Plattform-Mechanik -> Misstrauen).
//
// Das Home-Premium-Rework (#2199, 01.06.) hat die Hauptseite von sechs auf zwanzig
// Sections ausgebaut und dabei umsortiert — Berater steht jetzt weit hinten, dafür
// kamen koordination/prozess/bgh/wertminderung/founders u.a. dazu. Die alte
// Fünfer-Kette gibt es nicht mehr; der Test war seither rot.
//
// Statt die Ist-Reihenfolge 1:1 festzuschreiben (das bräche bei jeder Umsortierung
// erneut), prüft er jetzt die Dramaturgie, die tatsächlich tragen muss: Aufhänger →
// Ansprüche → Service-Realität → Mechanik, und der Abschluss-CTA ganz am Ende.
test('Hauptseite Sections in tragender Dramaturgie', async ({ page }) => {
  await page.goto('/')
  const ariaLabels = await page
    .locator('section[aria-labelledby]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')))

  const idx = (id: string) => ariaLabels.indexOf(id)

  // Alle vier Anker existieren überhaupt.
  for (const id of [
    'hero-heading',
    'ansprueche-heading',
    'service-realitaet-heading',
    'plattform-mechanik-heading',
    'bottom-cta-heading',
  ]) {
    expect(idx(id), `Section ${id} fehlt auf der Hauptseite`).toBeGreaterThan(-1)
  }

  expect(idx('ansprueche-heading')).toBeGreaterThan(idx('hero-heading'))
  expect(idx('service-realitaet-heading')).toBeGreaterThan(idx('ansprueche-heading'))
  expect(idx('plattform-mechanik-heading')).toBeGreaterThan(idx('service-realitaet-heading'))
  // Der Abschluss-CTA ist die letzte Section der Seite.
  expect(idx('bottom-cta-heading')).toBe(ariaLabels.length - 1)
})
