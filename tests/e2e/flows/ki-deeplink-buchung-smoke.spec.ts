// Regel-4-Prod-Smoke: der KI-Deeplink von der Stadtseite bis in den Finder.
//
// WARUM ES DIESEN TEST GIBT: Am 25.08.2026 war der Deeplink drei Tage lang wirkungslos,
// ohne dass ein Build, ein tsc oder ein bestehender Smoke etwas gemeldet haette. Aaron fand
// es von Hand („es wird schlicht nichts gemacht"). Die Kette hat vier Glieder, und jedes
// kann still brechen, waehrend die anderen gruen aussehen:
//
//   1. Die Stadtseite nennt einen Termin  — mit UHRZEIT, sonst ist es keine Terminangabe
//   2. Die URL steht als sichtbarer TEXT  — im href allein erreicht sie kein LLM
//   3. Ohne `adresse=`: der Wizard QUITTIERT den mitgebrachten Termin
//   4. Mit `adresse=`:  der Wizard springt bis zur Schadenart durch
//
// Glied 2 und 3 waren gebrochen und sahen von aussen identisch zu „alles in Ordnung" aus.
//
// Run: CI=1 npx playwright test ki-deeplink-buchung-smoke --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const STADT = 'Köln'
const SLUG = 'koeln'

/**
 * Naechsten Termin zur Laufzeit holen — NIE eine Fixture.
 *
 * Slots wandern im Minutentakt (gemessen: 07:40 → 08:20 → 09:00 innerhalb einer Stunde).
 * Ein eingefrorener Slot waere binnen einer Stunde ein Fehlalarm, und ein Test, der
 * regelmaessig grundlos rot ist, wird weggeklickt statt gelesen.
 */
async function holeNaechstenTermin(): Promise<{ svId: string; slot: string } | null> {
  try {
    const res = await fetch(`${APP}/api/v1/gutachter-termine?ort=${encodeURIComponent(STADT)}`)
    if (!res.ok) return null
    const j = (await res.json()) as {
      gutachter?: Array<{ id?: string; termine?: Array<{ start?: string }> }>
    }
    const g = j.gutachter?.[0]
    const slot = g?.termine?.[0]?.start
    return g?.id && slot ? { svId: g.id, slot } : null
  } catch {
    return null
  }
}

test.describe('KI-Deeplink — von der Stadtseite bis in den Finder', () => {
  test('Stadtseite nennt Termin mit Uhrzeit und die URL als sichtbaren Text', async ({ page }) => {
    const res = await page.goto(`${MARKETING}/kfz-gutachter/${SLUG}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)

    const html = await page.content()
    // Kein Termin verfuegbar (Nacht, Feiertag, Netz leer) → nichts zu pruefen. Bewusst
    // skip statt rot: die Abwesenheit eines Termins ist kein Defekt.
    test.skip(
      !html.includes('Nächster freier Vor-Ort-Termin'),
      'Aktuell kein freier Termin in ' + STADT + ' — nichts zu pruefen',
    )

    // Glied 1: UHRZEIT, nicht nur Datum. Vorher stand dort „Dienstag, 25.08." und sonst
    // nichts — ein Modell konnte die Zeit nicht nennen, weil sie nirgends stand.
    const text = await page.locator('body').innerText()
    expect(text, 'Termin-Block muss eine Uhrzeit nennen (HH:MM Uhr)').toMatch(/\d{1,2}:\d{2}\s*Uhr/)

    // Glied 2: die URL als TEXT. Ein LLM-Web-Tool ersetzt <a href> durch „[19]" — im href
    // allein kommt sie nie an.
    expect(text, 'Direktlink muss als Fliesstext dastehen').toContain('Direktlink zu diesem Termin')
    const sichtbareUrl = text.match(/https:\/\/claimondo\.de\/gutachter-finden\?[^\s]*slot=[^\s]*/)
    expect(sichtbareUrl, 'die vollstaendige Buchungs-URL muss im sichtbaren Text stehen').not.toBeNull()

    // ⚠ Der Trenner, der den Satz von seiner URL riss. React setzt ihn bei `Satz: {wert}`;
    // ein Extraktor, der an Kommentargrenzen schneidet, verliert dadurch den Zusammenhang.
    expect(
      html.includes('Direktlink zu diesem Termin: <!-- -->'),
      'zwischen Satz und URL darf kein React-Kommentar stehen',
    ).toBe(false)
  })

  test('Deeplink OHNE Adresse quittiert den mitgebrachten Termin', async ({ page }) => {
    const t = await holeNaechstenTermin()
    test.skip(!t, 'Termin-API liefert gerade keinen Slot fuer ' + STADT)

    // Genau die URL, die die Stadtseite baut: `stadt=`, KEIN `adresse=`. Das ist der Fall,
    // der bis zum 25.08. in einen leeren Wizard lief.
    await page.goto(
      `${MARKETING}/gutachter-finden?stadt=${encodeURIComponent(STADT)}` +
        `&sv=${t!.svId}&slot=${encodeURIComponent(t!.slot)}`,
      { waitUntil: 'domcontentloaded' },
    )

    const frame = page.frameLocator('iframe[src*="embed/gutachter-finder"]')
    const quittung = frame.getByText(/Ihr Termin .*ist vorgemerkt|Ihr Termin ist vorgemerkt/)
    await expect(quittung, 'der Wizard muss den mitgebrachten Termin quittieren').toBeVisible({
      timeout: 30_000,
    })

    // Die Quittung muss die BERLINER Uhrzeit nennen. Der Slot kommt als UTC — eine Anzeige
    // ohne timeZone laege zwei Stunden daneben und saehe trotzdem plausibel aus.
    const erwartet = new Date(t!.slot).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    })
    await expect(
      frame.getByText(new RegExp(erwartet.replace(':', ':') + '\\s*Uhr')),
      `Quittung muss ${erwartet} Uhr (Berlin) zeigen, nicht die UTC-Zahl`,
    ).toBeVisible({ timeout: 15_000 })
  })

  test('Deeplink MIT Adresse springt bis zur Schadenart durch', async ({ page }) => {
    const t = await holeNaechstenTermin()
    test.skip(!t, 'Termin-API liefert gerade keinen Slot fuer ' + STADT)

    // Der Idealfall: die KI hat den Standort im Gespraech erfragt (llms.txt weist sie an).
    // Dann entfaellt der Ort-Schritt und der Kunde landet direkt bei der Schadenart.
    await page.goto(
      `${MARKETING}/gutachter-finden?adresse=${encodeURIComponent('Domkloster 4, 50667 Köln')}` +
        `&sv=${t!.svId}&slot=${encodeURIComponent(t!.slot)}`,
      { waitUntil: 'domcontentloaded' },
    )

    // `.first()` ist noetig, nicht kosmetisch: „Was ist passiert?" steht als Ueberschrift
    // UND in der Unterzeile, Playwright's strict mode bricht bei zwei Treffern ab. Beim
    // ersten Lauf sah das aus wie ein Produktfehler — der Schritt WAR erreicht, nur die
    // Zusicherung konnte sich nicht entscheiden, welchen Treffer sie meint.
    const frame = page.frameLocator('iframe[src*="embed/gutachter-finder"]')
    await expect(
      frame.getByText(/Was ist passiert|Wählen Sie die Schadenart/i).first(),
      'mit Adresse muss der Wizard Ort UND Termin ueberspringen',
    ).toBeVisible({ timeout: 40_000 })
  })
})
