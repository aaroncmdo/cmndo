// Regel-4-Prod-Smoke: die Autoren-Byline (E-E-A-T) auf den ausgelieferten Seiten.
//
// WARUM ES DIESEN TEST GIBT: Die Byline ist ein reines Anzeige-Signal — sie hat keinen
// Button und keinen Zustand, an dem ein Fehler auffiele. Faellt sie weg (geloeschter
// Import, geaenderter Seiten-Aufbau, ein Layout, das sie ausserhalb des Dokuments
// rendert), sieht die Seite voellig normal aus. Der Verlust waere still.
//
// Gemessen wird BEIDES, weil beide Leser zaehlen und unterschiedlich lesen:
//
//   page.content()   — was ein Crawler/LLM bekommt (auch ausserhalb des Viewports)
//   innerText        — was ein Mensch tatsaechlich sieht (nur GERENDERTES Layout)
//
// Ein Block kann im HTML stehen und trotzdem unsichtbar sein (display:none, 0px hoch,
// hinter einem Overlay). Nur der Doppelcheck faengt das.
//
// Run: CI=1 npx playwright test autorenschaft-byline --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'

// Eine Seite je Typ — die Familien unterscheiden sich im Aufbau, nicht nur im Text.
const SEITEN = [
  { pfad: '/kfz-gutachter/koeln', typ: 'Stadtseite (ai_generated -> verantwortlich)' },
  { pfad: '/kfz-gutachter/kosten', typ: 'Ratgeber (handgeschrieben -> geprueft)' },
  // Slug aus der LIVE-Sitemap uebernommen, nicht geraten — ein erfundener Pfad haette
  // den Test mit 404 rot gemacht und wie ein Byline-Fehler ausgesehen.
  {
    pfad: '/wissen/herstellermacht-freie-werkstaetten-recht-auf-reparatur',
    typ: 'Wissensartikel (Autor aus DB)',
  },
]

const BYLINE = /(Redaktionell verantwortlich|Fachlich geprüft von)/

test.describe('Autoren-Byline auf prod', () => {
  for (const { pfad, typ } of SEITEN) {
    test(`${pfad} — sichtbar für Mensch UND Crawler (${typ})`, async ({ page }) => {
      const res = await page.goto(`${MARKETING}${pfad}`, { waitUntil: 'domcontentloaded' })
      expect(res?.status(), `${pfad} muss erreichbar sein`).toBe(200)

      // 1) Crawler-Sicht: steht sie im ausgelieferten Dokument?
      const html = await page.content()
      expect(html, `${pfad}: Byline fehlt im HTML — kein E-E-A-T-Signal für LLMs`).toMatch(BYLINE)

      // 2) Menschen-Sicht: ist sie tatsaechlich gerendert?
      //
      // ⚠ Die Byline sitzt am Seitenende, also ausserhalb des ersten Viewports. `innerText`
      // liefert nur GERENDERTES Layout — ohne Scroll fehlt sie, obwohl sie da ist. Genau
      // diese Verwechslung hat am 28.08. einen Fehlalarm erzeugt. Deshalb erst ans Ende.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect
        .poll(async () => BYLINE.test(await page.innerText('body')), {
          timeout: 15_000,
          message: `${pfad}: Byline steht im HTML, wird aber nicht sichtbar gerendert`,
        })
        .toBe(true)

      // 3) Person-Schema — das maschinenlesbare Gegenstueck der sichtbaren Nennung.
      //    NUR fuer natuerliche Personen; die „Claimondo-Redaktion" bekommt bewusst keins
      //    (das waere eine erfundene Identitaet). Deshalb an die sichtbare Variante gekoppelt
      //    statt pauschal gefordert.
      if (/Fachlich geprüft von|Aaron Sprafke/.test(html)) {
        expect(html, `${pfad}: benannte Person ohne Person-Schema`).toContain('"@type":"Person"')
      }
    })
  }
})
