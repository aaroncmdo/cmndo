import { describe, it, expect } from 'vitest'
import { planeFinSchreiben } from '../fin-schreiben'

// Aaron 09.09.2026: die vom Kunden bestätigte Nummer gehört in „Gutachten und Fahrzeug".
// Diese Tests halten fest, WANN geschrieben wird — und wann bewusst nicht.

const PLATZHALTER = '11111111-1111-1111-1111-111111111111'
const GUELTIG = 'HMU6910000K234157'

describe('planeFinSchreiben', () => {
  it('Normalfall: das Fahrzeug hat noch keine Nummer → schreiben und Platzhalter absorbieren', () => {
    // So sieht jeder Fall aus, der über den FlowLink entstanden ist: die Fahrzeugzeile
    // wird bei der Anlage ohne Nummer erzeugt.
    expect(planeFinSchreiben(GUELTIG, null, PLATZHALTER)).toEqual({
      aktion: 'schreiben',
      fin: GUELTIG,
      absorbierePlatzhalter: PLATZHALTER,
    })
  })

  it('dieselbe Nummer steht schon da → nichts tun', () => {
    expect(planeFinSchreiben(GUELTIG, GUELTIG, PLATZHALTER)).toEqual({
      aktion: 'nichts', grund: 'identisch',
    })
  })

  it('Groß-/Kleinschreibung und Leerzeichen entscheiden nicht über „identisch"', () => {
    expect(planeFinSchreiben('  hmu6910000k234157 ', GUELTIG, PLATZHALTER)).toEqual({
      aktion: 'nichts', grund: 'identisch',
    })
  })

  it('das Fahrzeug hat eine ANDERE Nummer → schreiben, aber nichts absorbieren', () => {
    // Ein Fahrzeug mit eigener Nummer ist kein Platzhalter. Es darf nicht verschwinden,
    // nur weil ein Fall auf ein anderes Fahrzeug umgehängt wird — daran hängen
    // Vorschäden, Flottenzuordnung und Schadenkarten anderer Vorgänge.
    expect(planeFinSchreiben(GUELTIG, 'W0L0AHL0855123456', PLATZHALTER)).toEqual({
      aktion: 'schreiben',
      fin: GUELTIG,
      absorbierePlatzhalter: null,
    })
  })

  it('leere Eingabe → nichts tun', () => {
    expect(planeFinSchreiben('', null, PLATZHALTER).aktion).toBe('nichts')
    expect(planeFinSchreiben(null, null, PLATZHALTER)).toEqual({ aktion: 'nichts', grund: 'leer' })
    expect(planeFinSchreiben(undefined, null, PLATZHALTER)).toEqual({ aktion: 'nichts', grund: 'leer' })
    expect(planeFinSchreiben('   ', null, PLATZHALTER)).toEqual({ aktion: 'nichts', grund: 'leer' })
  })

  it('zu kurz, zu lang oder mit verbotenen Buchstaben → nichts tun', () => {
    // Die Spalte trägt CHECK(length = 17). Würde eine krumme Eingabe durchgereicht,
    // bräche der Schreibvorgang — und mit ihm die übrigen Korrekturen desselben Vorgangs.
    for (const krumm of ['HMU6910000K23415', 'HMU6910000K2341577', 'HMU691OOOOK234157', 'HMU6910000K23415I', 'Mahzawackfahrzeug']) {
      expect(planeFinSchreiben(krumm, null, PLATZHALTER)).toEqual({ aktion: 'nichts', grund: 'format' })
    }
  })

  it('gültige Nummer ohne bekanntes Fahrzeug → schreiben, nichts zu absorbieren', () => {
    expect(planeFinSchreiben(GUELTIG, null, null)).toEqual({
      aktion: 'schreiben', fin: GUELTIG, absorbierePlatzhalter: null,
    })
  })

  it('Kleinbuchstaben werden normalisiert geschrieben', () => {
    const plan = planeFinSchreiben('hmu6910000k234157', null, PLATZHALTER)
    expect(plan.aktion === 'schreiben' && plan.fin).toBe(GUELTIG)
  })
})
