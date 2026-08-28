// Regel-4-Waechter: tragen die Seiten, die KI-Crawler tatsaechlich lesen, einen
// buchbaren Termin — mit der URL als sichtbarem TEXT?
//
// WARUM DIESE SEITEN: Der nginx-Zugriffslog (25.–27.08.2026) zeigt, welche Seiten
// ChatGPT & Co. von SELBST holen. Die Stadtseiten gehoeren NICHT dazu — die werden nur
// aufgerufen, wenn ein Nutzer die URL ausdruecklich nennt. Gelesen werden die
// Fachseiten: /haftpflicht/*, /wissen/*, /decoder/*, /schadensreport-2026.
//
// Genau die trugen bis #5652/#5667 null Termine. Die gesamte Buchbarkeit lag auf den
// Seiten, die ein Modell von allein nie ansteuert.
//
// Run: CI=1 npx playwright test termine-auf-ki-seiten --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'

// Je eine Seite pro Einbaustelle — nicht alle 18, das waere Laufzeit ohne Erkenntnis.
const SEITEN = [
  { pfad: '/haftpflicht/wertminderung', quelle: 'SpokeCtaBand (18 Seiten)' },
  { pfad: '/kfz-gutachter/vermittlungsportale-vergleich', quelle: 'RatgeberStaedteSection (9 Seiten)' },
  { pfad: '/decoder/reparatur-unwirtschaftlich', quelle: 'decoder/[slug]' },
  { pfad: '/schadensreport-2026', quelle: 'Report-Seite' },
]

for (const { pfad, quelle } of SEITEN) {
  test(`${pfad} traegt einen buchbaren Termin — ${quelle}`, async ({ page }) => {
    const res = await page.goto(`${MARKETING}${pfad}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), 'Seite muss erreichbar sein').toBe(200)

    // ⚠ `content()` (HTML), NICHT `innerText`.
    //
    // Gemessen am 28.08.2026: der Block steht im DOM und `isVisible` meldet true —
    // `body.innerText()` gibt ihn trotzdem NICHT aus, weil er unterhalb des Viewports
    // liegt und innerText nur liefert, was im Layout gerendert ist. Vier Seiten wurden
    // dadurch als „Block FEHLT" gemeldet, obwohl er auf allen vieren stand.
    // Fuer die Frage hier ist das HTML ohnehin die richtige Quelle: ein Crawler scrollt nicht.
    const text = (await page.content())
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')

    // Kein Termin frei (Nacht, Feiertag, Netz leer) → nichts zu pruefen. Bewusst skip
    // statt rot: die Abwesenheit eines Termins ist kein Defekt, und ein regelmaessig
    // grundlos roter Waechter wird weggeklickt statt gelesen.
    test.skip(
      !text.includes('Nächste freie Vor-Ort-Termine'),
      'aktuell kein freier Termin im Netz — nichts zu pruefen',
    )

    // Die URL muss als TEXT dastehen. Im href allein erreicht sie kein LLM: das Web-Tool
    // ersetzt `<a href>` durch eine nummerierte Referenz und verliert den Zielwert.
    expect(
      text,
      'die Stadtseiten-URL muss als Fliesstext dastehen, nicht nur im href',
    ).toMatch(/https:\/\/claimondo\.de\/kfz-gutachter\/[a-z-]+/)

    // Und eine Uhrzeit — ein Termin ohne Zeit ist keine Terminangabe.
    expect(text, 'der Termin muss eine Uhrzeit nennen').toMatch(/\d{1,2}:\d{2} Uhr/)
  })
}
