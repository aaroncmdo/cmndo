// Die OAIQ-Payload wird an ZWEI Stellen gebaut: im Marketing-Build
// (lead_created) und im App-Build (appointment_scheduled / order_created).
// Ein geteiltes Modul gibt es nicht — die beiden Next-Builds haben getrennte
// Abhaengigkeitsbaeume und je eigene `@/`-Aufloesung.
//
// Weicht eine Kopie ab, verwirft OpenAI die Events der einen Seite still: kein
// Fehler, kein roter Build, nur eine Zahl, die im Ads Manager fehlt — und zwar
// ausgerechnet bei den Abschluss-Events, die ueber Go/No-Go des Kanals
// entscheiden. Die Anleitung loest das mit „beim Aendern beide anfassen"; das
// ist eine Bitte, die man vergisst. Dieser Test macht daraus einen roten Lauf.
//
// Verglichen wird TEXT, nicht Verhalten: die beiden Module lassen sich hier
// nicht beide importieren (unterschiedliche Alias-Wurzeln), und der Textvergleich
// faengt die Drift genauso zuverlaessig.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKETING = 'claimondo-marketing/lib/analytics/oaiq-capi.ts'
const APP = 'src/lib/analytics/oaiq-capi.ts'

function lies(relPfad: string): string {
  // CRLF -> LF: unter Windows checkt git die Dateien mit CRLF aus, in CI mit LF.
  // Ohne Normalisierung waere dieser Test lokal gruen und in CI rot — genau die
  // Falle, die in dieser Codebase schon einmal zugeschnappt ist.
  return readFileSync(join(process.cwd(), relPfad), 'utf8').replace(/\r\n/g, '\n')
}

/** Schneidet einen benannten Block heraus — von der Fundstelle bis zur Zeile, die auf Spalte 0 schliesst. */
function block(quelle: string, start: string): string {
  const i = quelle.indexOf(start)
  if (i < 0) return ''
  const rest = quelle.slice(i)
  const ende = rest.indexOf('\n}\n')
  return ende < 0 ? rest : rest.slice(0, ende + 2)
}

describe('OAIQ-Payload: Marketing-Build und App-Build bauen dasselbe', () => {
  it('baueOaiqPayload ist in beiden Builds textgleich', () => {
    const m = block(lies(MARKETING), 'export function baueOaiqPayload')
    const a = block(lies(APP), 'export function baueOaiqPayload')

    // Positivkontrolle: findet der Extraktor ueberhaupt etwas? Ohne diese
    // Zusicherung waeren zwei leere Strings "gleich" und der Test blind.
    expect(m.length, 'baueOaiqPayload im Marketing-Build nicht gefunden').toBeGreaterThan(200)
    expect(a.length, 'baueOaiqPayload im App-Build nicht gefunden').toBeGreaterThan(200)

    expect(a).toBe(m)
  })

  it('DATA_SHAPE ist in beiden Builds textgleich', () => {
    const m = block(lies(MARKETING), 'const DATA_SHAPE')
    const a = block(lies(APP), 'const DATA_SHAPE')
    expect(m.length, 'DATA_SHAPE im Marketing-Build nicht gefunden').toBeGreaterThan(50)
    expect(a).toBe(m)
  })

  it('beide senden an denselben Endpunkt', () => {
    const endpunkt = /const ENDPOINT = '([^']+)'/
    const m = lies(MARKETING).match(endpunkt)?.[1]
    const a = lies(APP).match(endpunkt)?.[1]
    expect(m).toBe('https://bzr.openai.com/v1/events')
    expect(a).toBe(m)
  })

  it('der API-Schluessel wird nirgends ins Client-Bundle gereicht', () => {
    // NEXT_PUBLIC_ macht eine Variable build-time-inlined und damit oeffentlich.
    // Beim Pixel-ID ist das gewollt, beim Schluessel waere es ein Leak.
    for (const datei of [MARKETING, APP]) {
      expect(lies(datei), `${datei} darf OAIQ_API_KEY nicht als NEXT_PUBLIC_ lesen`)
        .not.toMatch(/NEXT_PUBLIC_OAIQ_API_KEY/)
    }
  })
})
