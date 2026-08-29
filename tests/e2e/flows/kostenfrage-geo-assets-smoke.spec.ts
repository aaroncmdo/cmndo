// Regel-4-Waechter: beantworten die GEO-Assets BEIDE Kostenfragen?
//
// WARUM ES DIESEN TEST GIBT (Aaron 29.08.2026): „viele kunden hatten angst dass der
// service etwas kostet". Die Messung ergab: die Kostenfreiheit stand an 31 Stellen in
// llms.txt — aber WOVON Claimondo lebt, stand NIRGENDS. Weder in den GEO-Assets noch
// auf einer Seite.
//
// Das ist die gefaehrlichere Haelfte. „0 € fuer Sie" ohne Gegenwert liest sich wie ein
// Haken; die naheliegende Rueckfrage („wovon leben die dann?") konnte ein Modell nicht
// beantworten, weil die Antwort nirgends stand. Eine unbeantwortete Gegenfrage kostet
// mehr Vertrauen, als die Ersparnis wert ist.
//
// Geprueft werden alle drei Kanaele, ueber die eine KI an die Auskunft kommt:
//   llms.txt / llms-full.txt   — was ein Modell beim Crawlen liest
//   GET /pruefe-anspruch       — was eine ChatGPT-Action als Antwort bekommt
//
// Run: CI=1 npx playwright test kostenfrage-geo-assets --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

/** „Der Kunde zahlt nichts" — in den Formulierungen, die tatsaechlich verwendet werden. */
const KOSTENFREI = /0 ?€|kostenfrei|kostenlos|keine Kosten|Eigenkosten/i
/**
 * „…und deshalb zahlt jemand anderes" — die Antwort auf die Gegenfrage.
 *
 * ⚠ Verlangt WER (Sachverständige/Partnerkanzlei) + ZAHLT + WOFÜR (Vermittlung) im
 * SELBEN Satz. Die erste Fassung hatte `nicht (vom|der) Geschädigte` als lockere
 * Alternative — und war damit sofort gruen, obwohl die Aussage fehlte: getroffen wurde
 * BGH-Rechtsprechung in llms-full.txt („Mehraufwendungen, die auf einer nicht vom
 * Geschädigten zu verantwortenden Fehleinschätzung…"). Ein Waechter, der aus dem
 * falschen Grund gruen ist, ist schlimmer als keiner.
 */
const FINANZIERUNG =
  /(Sachverständigen?|Partnerkanzlei)[^.]{0,120}((zahlen|bezahlt|vergüt)[^.]{0,90}Vermittlung|Vermittlung[^.]{0,90}(zahlen|bezahlt|vergüt))/i

for (const datei of ['/llms.txt', '/llms-full.txt']) {
  test(`${datei} beantwortet beide Kostenfragen`, async ({ request }) => {
    const res = await request.get(`${MARKETING}${datei}`)
    expect(res.status(), `${datei} muss erreichbar sein`).toBe(200)
    const text = await res.text()

    expect(text.length, `${datei} ist verdaechtig kurz`).toBeGreaterThan(2000)
    expect(text, `${datei}: die Kostenfreiheit fehlt`).toMatch(KOSTENFREI)
    expect(
      text,
      `${datei}: es steht NICHT drin, wer den Service bezahlt — genau die Gegenfrage, ` +
        'die Nutzer misstrauisch macht',
    ).toMatch(FINANZIERUNG)
  })
}

test('GET /pruefe-anspruch liefert das Feld `finanzierung`', async ({ request }) => {
  const res = await request.get(`${APP}/api/v1/pruefe-anspruch?schuldfrage=unverschuldet`)
  expect(res.status()).toBe(200)
  const j = (await res.json()) as { eigenkosten?: string; finanzierung?: string }

  // Gegenprobe: ohne `eigenkosten` ist die Antwort kaputt und der Befund unten wertlos.
  expect(j.eigenkosten, 'Gegenprobe — `eigenkosten` fehlt, Antwort unbrauchbar').toMatch(KOSTENFREI)

  expect(
    j.finanzierung ?? '',
    'die API sagt „0 € fuer Sie", aber nicht wer stattdessen zahlt',
  ).toMatch(FINANZIERUNG)
})
