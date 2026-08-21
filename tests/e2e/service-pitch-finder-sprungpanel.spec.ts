import { test, expect, type Page } from '@playwright/test'

// Smoke fuer das FinderSprungPanel auf /gutachter-finden (loest die 80px-Linkleiste ab).
//
// Run lokal gegen den Dev-Server:
//   PLAYWRIGHT_MARKETING_URL=http://127.0.0.1:3482 npx playwright test \
//     tests/e2e/service-pitch-finder-sprungpanel.spec.ts --project=marketing
//
// ⚠ Der Dateiname beginnt mit `service-pitch-`, weil playwright.config.ts genau
// dieses Muster ins `marketing`-Projekt sortiert. Ohne das erbt die Spec die
// APP-baseURL (app.claimondo.de) und bekommt eine 404-HTML-Seite statt des Finders.
//
// ⚠ Das Sheet wird NICHT bedingt gerendert, sondern per `translate-y` aus dem Bild
// geschoben (SEO: die Links muessen im initialen HTML stehen). Deshalb ist
// `toBeVisible()` hier das FALSCHE Werkzeug — ein verschobenes Element gilt
// Playwright weiterhin als sichtbar. Der Zustand wird ueber `toBeInViewport()`
// geprueft.

const FINDER = '/gutachter-finden'

async function oeffneStaedte(page: Page) {
  await page.getByRole('button', { name: 'Städte', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Städte' })).toBeInViewport()
  // ⚠ `toBeInViewport()` schlaegt an, sobald ein TEIL sichtbar ist — mitten in
  // der 300ms-Transition. Screenshots zeigten das Panel dadurch halb
  // eingefahren und unten abgeschnitten, was wie ein Layout-Fehler aussah.
  await page.waitForTimeout(400)
}

test.describe('Finder-Sprungpanel — Desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('die alte Linkleiste ist weg, die Karte nutzt die volle Hoehe', async ({ page }) => {
    await page.goto(FINDER)
    await expect(page.locator('nav[aria-label="Weitere Seiten zu Kfz-Gutachtern"]')).toHaveCount(0)
    // Der Embed fuellt den Viewport — vorher blieben 5rem fuer die Leiste frei.
    const frame = page.locator('iframe').first()
    const box = await frame.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThan(700)
  })

  test('beide Knoepfe sind da und bleiben zurueckhaltend', async ({ page }) => {
    await page.goto(FINDER)
    const staedte = page.getByRole('button', { name: 'Städte', exact: true })
    const ratgeber = page.getByRole('button', { name: 'Ratgeber', exact: true })
    await expect(staedte).toBeInViewport()
    await expect(ratgeber).toBeInViewport()

    // „nicht so praesent" (Aaron): klein und unten links, nicht bildschirmfuellend.
    const box = await staedte.boundingBox()
    expect(box?.height ?? 99).toBeLessThan(48)
    expect(box?.width ?? 999).toBeLessThan(160)
    expect(box?.y ?? 0).toBeGreaterThan(700) // untere Bildschirmhaelfte
    expect(box?.x ?? 999).toBeLessThan(200) // linke Seite

    await page.screenshot({ path: 'test-results/finder-01-desktop-geschlossen.png' })
  })

  test('das Panel ist zu, bevor man klickt — und danach offen', async ({ page }) => {
    await page.goto(FINDER)
    const sheet = page.getByRole('dialog', { name: 'Städte' })
    await expect(sheet).not.toBeInViewport()
    await oeffneStaedte(page)
    await page.screenshot({ path: 'test-results/finder-02-desktop-staedte-offen.png' })
  })

  test('ein Klick auf eine Stadt zentriert die Karte, statt die Seite zu verlassen', async ({ page }) => {
    await page.goto(FINDER)
    await oeffneStaedte(page)
    await page.getByRole('link', { name: 'Köln', exact: true }).click()

    // Kernversprechen: der Kunde bleibt im Finder.
    await expect(page).toHaveURL(/\/gutachter-finden\?/)
    await expect(page).toHaveURL(/lat=50\.94/)
    await expect(page).toHaveURL(/lng=6\.95/)
    await expect(page.getByRole('dialog', { name: 'Städte' })).not.toBeInViewport()

    // Und die Koordinaten landen wirklich im Embed — ohne das waere der Klick Kosmetik.
    await expect(page.locator('iframe').first()).toHaveAttribute('src', /lat=50\.94/)
    await page.screenshot({ path: 'test-results/finder-03-desktop-nach-klick-koeln.png' })
  })

  test('der Pfeil fuehrt doch auf die Stadtseite', async ({ page }) => {
    await page.goto(FINDER)
    await oeffneStaedte(page)
    await page.getByRole('link', { name: 'Stadtseite Köln' }).click()
    await expect(page).toHaveURL(/\/kfz-gutachter\/koeln$/)
  })

  test('der Ratgeber-Knopf oeffnet sein eigenes Panel', async ({ page }) => {
    await page.goto(FINDER)
    await page.getByRole('button', { name: 'Ratgeber', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Ratgeber' })
    await expect(sheet).toBeInViewport()
    await expect(sheet.getByRole('link', { name: 'Was ein Gutachten kostet' })).toBeVisible()
    await page.screenshot({ path: 'test-results/finder-04-desktop-ratgeber.png' })
  })

  test('ein Klick auf den Hintergrund schliesst wieder', async ({ page }) => {
    await page.goto(FINDER)
    await oeffneStaedte(page)
    await page.mouse.click(1200, 200)
    await expect(page.getByRole('dialog', { name: 'Städte' })).not.toBeInViewport()
  })
})

test.describe('Finder-Sprungpanel — Mobil', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14

  test('das Panel kommt als Bottom-Sheet ueber die volle Breite', async ({ page }) => {
    await page.goto(FINDER)
    await page.screenshot({ path: 'test-results/finder-05-mobil-geschlossen.png' })

    await oeffneStaedte(page)
    const box = await page.getByRole('dialog', { name: 'Städte' }).boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(370) // volle Breite (390 - Rand)
    expect(box?.x ?? 99).toBeLessThan(20) // linksbuendig, kein Panel
    // Von unten, aber nicht bildschirmfuellend — die Karte bleibt sichtbar.
    expect(box?.y ?? 0).toBeGreaterThan(150)
    await page.screenshot({ path: 'test-results/finder-06-mobil-bottom-sheet.png' })
  })

  test('die Liste laesst sich scrollen', async ({ page }) => {
    await page.goto(FINDER)
    await oeffneStaedte(page)
    const liste = page.locator('[role="dialog"][aria-label="Städte"] .overflow-y-auto')
    const hoehe = await liste.evaluate((el) => ({ scroll: el.scrollHeight, sicht: el.clientHeight }))
    // 173 Staedte passen in kein Sheet — ohne Scrollbarkeit waere die Liste eine Attrappe.
    expect(hoehe.scroll).toBeGreaterThan(hoehe.sicht)
  })
})

test.describe('Finder-Sprungpanel — SEO', () => {
  test('alle Stadt-Links stehen im HTML, OHNE dass jemand klickt', async ({ request }) => {
    // Der eigentliche Zweck der Konstruktion: ein Crawler fuehrt kein JS aus.
    // Waere das Sheet `{offen && …}`, waeren hier 0 Links — bei optisch
    // identischer Seite.
    const html = await (await request.get(FINDER)).text()
    const ohneScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    const ziele = new Set(
      [...ohneScript.matchAll(/href="(\/kfz-gutachter\/[a-z-]+)"/g)].map((m) => m[1]),
    )
    expect(ziele.size).toBeGreaterThan(150)
    expect(ziele.has('/kfz-gutachter/koeln')).toBe(true)
    expect(ziele.has('/kfz-gutachter/berlin')).toBe(true)
  })

  test('die Meta-Description nennt den Umfang und bleibt unter der Google-Grenze', async ({ request }) => {
    const html = await (await request.get(FINDER)).text()
    const beschreibung = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
    expect(beschreibung).toMatch(/\d{2,} Städten/)
    expect(beschreibung.length).toBeGreaterThan(80)
    expect(beschreibung.length).toBeLessThanOrEqual(158)
  })
})
