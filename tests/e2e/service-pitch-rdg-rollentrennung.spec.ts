// Regel-4-Prod-Smoke: RDG-Rollentrennung im GERENDERTEN Text (Copy-Audit 04.09.2026, PR #5862).
//
// Soll (Aaron 31.05.2026): Claimondo koordiniert, kommuniziert, rechnet ab. Verhandeln,
// durchsetzen, zurueckholen, klagen tut ausschliesslich "unsere Partnerkanzlei". Nie
// "wir verhandeln", nie "unser Anwalt", nie "Claimondo setzt ... durch". Das gilt fuer das,
// was ein Mensch liest (innerText), fuer das, was eine KI aus llms-full.txt liest, und fuer
// die OG-Beschreibung, die in Messengern/Social angezeigt wird.
//
// Warum gerendert und nicht Quelltext: Die Verstoesse sassen in TS-Konstanten und
// Komponenten-Defaults — ein Grep ueber de.json sah sie nicht (Audit E, 23.08.). Der
// Detektor ist derselbe wie im Repo-Scanner (scripts/lib/copy-lint-scan.mjs), damit
// Quelltext-Gate und Prod-Smoke dieselbe Aussage messen.
//
// Echte Eingabe: der /check-Wizard wird bis zur Auswertung durchgeklickt (Teilschuld-Pfad,
// dort steht der Satz aus check.result_quote_sub). Kein Rueckruf-Formular wird abgeschickt
// (wuerde einen Lead auf prod anlegen).
//
// Positivkontrolle (Regel 4, Messfalle 5): der Vorher-Satz wird zur Laufzeit in die Seite
// geschrieben und muss vom selben innerText-Pfad geflaggt werden — sonst beweist eine Null
// nichts.
//
// Run: npx playwright test service-pitch-rdg-rollentrennung --project=marketing
import { test, expect, type Page } from '@playwright/test'
import { scanRdg } from '../../scripts/lib/copy-lint-scan.mjs'

const SEITEN = [
  '/',
  '/faq',
  '/kfz-gutachter/ablauf',
  '/werkstatt/partner-werden',
  '/kfzgutachter-lp',
  '/haftpflicht/reparaturkosten',
  '/decoder/werkstatt-netz',
  '/vorteile',
]

async function gerenderterText(page: Page, pfad: string): Promise<string> {
  const res = await page.goto(pfad, { waitUntil: 'domcontentloaded' })
  expect(res?.status(), `${pfad} muss erreichbar sein`).toBe(200)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  // Textlaenge beobachten, bis sie stabil ist — "leer" und "noch nicht fertig" sehen gleich aus.
  let last = -1
  for (let i = 0; i < 10; i++) {
    const len = await page.evaluate(() => (document.body.innerText || '').length)
    if (len === last && len > 500) break
    last = len
    await page.waitForTimeout(600)
  }
  return page.evaluate(() => document.body.innerText || '')
}

function treffer(text: string) {
  return scanRdg(text).map((h: { code: string; match: string }) => `${h.code}: "${h.match}"`)
}

test.describe('RDG-Rollentrennung auf prod (gerendert)', () => {
  for (const pfad of SEITEN) {
    test(`${pfad} — kein "wir verhandeln/unser Anwalt/Claimondo setzt durch" im sichtbaren Text`, async ({ page }) => {
      const text = await gerenderterText(page, pfad)
      expect(text.length, 'Seite muss Inhalt rendern').toBeGreaterThan(500)
      expect(treffer(text), `RDG-Treffer auf ${pfad}`).toEqual([])
      expect(text, 'die Partnerkanzlei muss als handelnde Instanz vorkommen').toMatch(/Partnerkanzlei/)
    })
  }

  test('/vorteile — OG-Beschreibung ohne "holen wir zurück" und ohne "laut BGH"', async ({ page }) => {
    await page.goto('/vorteile', { waitUntil: 'domcontentloaded' })
    const og = await page.locator('meta[property="og:description"]').getAttribute('content')
    expect(og, 'og:description muss existieren').toBeTruthy()
    expect(treffer(og!)).toEqual([])
    expect(og!).not.toMatch(/laut BGH/)
    expect(og!).toMatch(/Partnerkanzlei/)
  })

  test('/llms-full.txt — KI-Feed ohne Erstperson-Rechtsverben', async ({ page }) => {
    const text = await (await page.request.get('/llms-full.txt')).text()
    expect(text.length).toBeGreaterThan(10_000)
    expect(treffer(text)).toEqual([])
    expect(text).toContain('unsere Partnerkanzlei')
  })

  test('/check — Teilschuld-Pfad bis zur Auswertung: "Unsere Partnerkanzlei holt das Maximum"', async ({ page }) => {
    await page.goto('/check', { waitUntil: 'domcontentloaded' })
    for (const name of [/Teils ich, teils der Gegner/, /Vor weniger als 1 Woche/, /Nein, noch nicht/]) {
      const knopf = page.getByRole('button', { name }).first()
      await knopf.waitFor({ state: 'visible', timeout: 20_000 }) // Hydration-Race: erst warten, dann klicken
      await knopf.click()
    }
    // Teilschuld-Auswertung heisst "Sie haben Ansprüche – anteilig" (Gegner-Pfad: "Das steht Ihnen zu")
    await expect(page.getByRole('heading', { name: /Sie haben Ansprüche|Das steht Ihnen zu/ })).toBeVisible({ timeout: 20_000 })
    const text = await page.evaluate(() => document.body.innerText || '')
    expect(text).toMatch(/§ ?254 BGB/) // der Teilschuld-Zweig, in dem der Satz steht
    expect(text).toContain('Unsere Partnerkanzlei holt das Maximum für Sie heraus.')
    expect(treffer(text)).toEqual([])
  })

  test('Positivkontrolle — derselbe Messpfad flaggt den Vorher-Text', async ({ page }) => {
    const sauber = await gerenderterText(page, '/')
    await page.evaluate(() => {
      const p = document.createElement('p')
      p.textContent = 'Versicherer kürzen trotzdem. Wir holen es zurück.'
      document.body.appendChild(p)
    })
    const verseucht = await page.evaluate(() => document.body.innerText || '')
    // Erst der Beweis, dass das Instrument lebt — dann die Aussage ueber die Seite.
    expect(treffer(verseucht)).toContain('wir_holen: "Wir holen es zurück"')
    expect(treffer(sauber)).toEqual([])
  })
})
