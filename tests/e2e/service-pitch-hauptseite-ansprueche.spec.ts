import { test, expect } from '@playwright/test'

// Doc 45 Task 3: ANSPRUECHE-Section auf Cluster-1 reframed.
// CardLink rendert <a> (kein <article>) — daher Text-basierte Assertions.

// ⚠ „unsere Partnerkanzlei führt sie", nicht „wir führen sie" — wer mit der gegnerischen
// Versicherung verhandelt, ist eine rechtliche Aussage (RDG). Die Seite trägt diese
// Fassung seit der i18n-Umstellung; der Test hing auf der alten und war rot.
//
// ⚠ HALBGEDANKENSTRICH (–, U+2013), nicht Geviertstrich (— U+2014). Genau daran hing
// dieser Test bis zum 26.08. rot: die Angleichung an die i18n-Fassung (Kommentar oben)
// tippte den falschen Strich, sonst war der Text zeichengleich. Der Nachweis steht in
// de.json (`ansprueche.heading`) — der Test darf ihn nicht „schöner" schreiben.
test('Hauptseite ANSPRUECHE-Section heißt "Vier Gespräche"', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#ansprueche-heading')).toContainText(
    'Vier Gespräche – unsere Partnerkanzlei führt sie, nicht Sie.',
  )
})

// Doc 45 wollte Card-TITEL in Wir-Form („Wir verhandeln …"). Das Home-Premium-Rework
// (#2199, 01.06.) hat die Titel auf den Kunden-Nutzen gedreht („Reparatur – oder Geld
// für ein gleichwertiges Auto") und die Wir-Perspektive in die Card-TEXTE verlegt.
// Die Absicht des Tests — auf der Seite handelt die Kanzlei, nicht der Kunde — gilt
// unverändert; sie wird jetzt dort geprüft, wo sie steht.
test('ANSPRUECHE-Cards sagen, dass die Partnerkanzlei handelt (nicht der Kunde)', async ({
  page,
}) => {
  await page.goto('/')
  const section = page.locator('section[aria-labelledby="ansprueche-heading"]')
  await expect(section.getByText(/Unsere Partnerkanzlei führt sie alle/)).toBeVisible()
  await expect(section.getByText(/Unsere Partnerkanzlei setzt sie nach der/)).toBeVisible()
  await expect(section.getByText(/Unsere Partnerkanzlei verhandelt einen Mietwagen/)).toBeVisible()
})
