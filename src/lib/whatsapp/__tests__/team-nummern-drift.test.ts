// Die Team-WA-Nummern stehen seit 06.09.2026 an ZWEI Stellen: kanonisch in
// src/lib/whatsapp/team-notify.ts und als Kopie in autounfall-io/lib/whatsapp/team-notify.ts.
//
// Die Kopie ist unvermeidbar — au.io ist ein eigener Build und kann src/ nicht importieren.
// Vermeidbar ist nur, dass die beiden Listen unbemerkt auseinanderlaufen: wer eine Nummer
// hier aendert und die andere Datei vergisst, bekaeme fuer au.io-Leads weiter die ALTE
// Nummer benachrichtigt — und wuerde es erst merken, wenn jemand eine erwartete Nachricht
// nicht bekommt. Das ist genau die Klasse "stiller Bruch, faellt Monate spaeter auf".
//
// Der Test liest beide Dateien vom Datentraeger statt sie zu importieren: au.io haengt an
// einer eigenen tsconfig/Alias-Aufloesung, und ein Import waere hier nur eine zweite
// Fehlerquelle. Gemessen wird der Inhalt, nicht das Modul.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const KANONISCH = join(process.cwd(), 'src/lib/whatsapp/team-notify.ts')
const KOPIE = join(process.cwd(), 'autounfall-io/lib/whatsapp/team-notify.ts')

/** Zieht die Telefonnummern aus einem `const … = ['+49…', '+49…']`-Literal. */
function nummern(pfad: string): string[] {
  const quelle = readFileSync(pfad, 'utf8')
  const treffer = [...quelle.matchAll(/'(\+\d{6,})'/g)].map((m) => m[1])
  return [...new Set(treffer)].sort()
}

describe('Team-WA-Nummern: kanonische Liste und au.io-Kopie', () => {
  it('beide Dateien tragen ueberhaupt Nummern', () => {
    // Positivkontrolle: findet der Leser nichts, waere der Vergleich unten trivial gruen —
    // zwei leere Listen sind auch "gleich". Genau so wird ein Test blind.
    expect(nummern(KANONISCH).length, 'kanonische Liste').toBeGreaterThan(0)
    expect(nummern(KOPIE).length, 'au.io-Kopie').toBeGreaterThan(0)
  })

  it('die Listen sind identisch', () => {
    expect(nummern(KOPIE), 'au.io weicht von src/lib/whatsapp/team-notify.ts ab').toEqual(
      nummern(KANONISCH),
    )
  })
})
