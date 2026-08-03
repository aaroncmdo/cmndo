// Verifikations-Smoke (operatives Soll): Im SELBSTZAHLER-Weg wird der Schaden festgestellt
// (schadenart + Hergang-Freitext = deklarative Feststellung im Ausgangszustand) UND der Kunde
// liefert die Schadensfotos selbst (kein SV macht Fotos). Beides muss der WERKSTATT in ihrem
// Auftrag sichtbar sein — sonst kann sie keinen fundierten KVA machen. Dieser Smoke beweist
// Aarons Frage: Feststellung -> Weitergabe -> Sichtbarkeit. Anders als Haftpflicht gibt es
// KEIN Gutachten (Negativ-Assert). Ausgangszustand aus scripts/smoke/reparatur-weg-e2e-seed.mjs.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test selbstzahler-feststellung-werkstatt-sicht --project=chromium
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'))
const FOTO = join(process.cwd(), 'tests/e2e/fixtures/test-schadenfoto.png')

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Selbstzahler: Schaden-Feststellung ist der Werkstatt sichtbar (Fall/Hergang/Fotos, kein Gutachten)', async ({ browser }) => {
  test.setTimeout(180_000)
  let wsCtx: BrowserContext | undefined
  let kdCtx: BrowserContext | undefined
  try {
    wsCtx = await browser.newContext()
    kdCtx = await browser.newContext()
    const ws = await wsCtx.newPage()
    const kd = await kdCtx.newPage()
    await login(ws, seed.werkstattEmail, seed.werkstattPw)
    await login(kd, seed.kundeEmail, seed.kundePw)

    await test.step('1) Kunde lädt ein Schadensfoto hoch (GeldZone → Schadenfotos)', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      // Reparatur-Route-Card muss da sein (istReparaturRoute-Gate = Selbstzahler/Kasko)
      await expect(kd.getByRole('heading', { name: 'Schadenfotos' })).toBeVisible({ timeout: 20_000 })
      // versteckter file-input (accept=image/*); setInputFiles umgeht das accept-Attribut
      await kd.locator('input[type="file"][accept="image/*"]').setInputFiles(FOTO)
      await expect(kd.locator('[data-sonner-toast]').filter({ hasText: /Fotos hochgeladen/ }))
        .toBeVisible({ timeout: 25_000 })
    })

    await test.step('2) Werkstatt öffnet ihren Auftrag', async () => {
      await ws.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await ws.reload({ waitUntil: 'domcontentloaded' }) // frische Sicht (Kunde-Foto einlesen)
    })

    await test.step('3a) Fall-Karte: Schadenart + Fahrzeug (Kennzeichen) sichtbar', async () => {
      await expect(ws.getByRole('heading', { name: 'Fall', exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(ws.getByText('eigenverschulden').first()).toBeVisible()
      await expect(ws.getByText('K-SM 4567').first()).toBeVisible() // Fahrzeug aus der Feststellung
    })

    await test.step('3b) Unfallhergang-Freitext (Fahrzeug & Unfall)', async () => {
      await expect(ws.getByRole('heading', { name: 'Fahrzeug & Unfall' })).toBeVisible()
      await expect(ws.getByText('Unfallhergang')).toBeVisible()
      await expect(ws.getByText(/Beim Ausparken die Beifahrertür/)).toBeVisible()
    })

    await test.step('3c) Schadensfotos-Grid (Kunde-Upload für Werkstatt sichtbar)', async () => {
      await expect(ws.getByRole('heading', { name: 'Schadensfotos' })).toBeVisible()
      await expect(ws.getByRole('img', { name: /Schadensfoto/ }).first()).toBeVisible()
    })

    await test.step('3d) KEIN Gutachten/Begutachtung (Selbstzahler ≠ Haftpflicht)', async () => {
      await expect(ws.getByRole('heading', { name: 'Gutachten', exact: true })).toHaveCount(0)
      await expect(ws.getByRole('heading', { name: 'Begutachtungstermin' })).toHaveCount(0)
    })
  } finally {
    await wsCtx?.close()
    await kdCtx?.close()
  }
})
