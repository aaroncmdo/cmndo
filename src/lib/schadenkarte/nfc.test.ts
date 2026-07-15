import { afterEach, describe, expect, it, vi } from 'vitest'
import { chipTraegtToken, nfcVerfuegbar } from './nfc'

describe('chipTraegtToken', () => {
  // DIE Kern-Sicherung. Traegt der Chip einen ANDEREN Token als der Aufkleber, hat die Karte
  // zwei Identitaeten: Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B. Ein stiller Datenfehler
  // auf physischem Material, der praktisch nicht auffindbar ist.
  it('akzeptiert die zurueckgelesene URL mit dem erwarteten Token', () => {
    expect(
      chipTraegtToken(
        'https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789',
        'SKT-ABCDEFGH23456789',
      ),
    ).toBe(true)
  })

  it('lehnt einen FREMDEN Token ab', () => {
    expect(
      chipTraegtToken(
        'https://app.claimondo.de/schaden/SKT-ZZZZZZZZ23456789',
        'SKT-ABCDEFGH23456789',
      ),
    ).toBe(false)
  })

  it('lehnt einen leeren/nicht lesbaren Chip ab', () => {
    expect(chipTraegtToken(null, 'SKT-ABCDEFGH23456789')).toBe(false)
    expect(chipTraegtToken('', 'SKT-ABCDEFGH23456789')).toBe(false)
    expect(chipTraegtToken('irgendwas', 'SKT-ABCDEFGH23456789')).toBe(false)
  })

  it('akzeptiert auch einen nackten Token (Chip ohne URL-Praefix)', () => {
    expect(chipTraegtToken('SKT-ABCDEFGH23456789', 'SKT-ABCDEFGH23456789')).toBe(true)
  })
})

describe('nfcVerfuegbar', () => {
  // vitest.config.ts setzt environment:'node' GLOBAL -> window ist hier kein jsdom-Stub,
  // sondern komplett undefined. Ein simples "erwarte false ohne Setup" wuerde also nur den
  // typeof-window-Kurzschluss im ersten && -Operanden treffen -- die eigentliche
  // Feature-Detection ('NDEFReader' in window) wuerde NIE ausgefuehrt und ein Tippfehler
  // genau dort bliebe unbemerkt gruen. vi.stubGlobal zwingt beide Branches echt durch die
  // Funktion (Vorbild: src/lib/offline/handlers/gps-position.test.ts).
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('meldet true wenn window.NDEFReader existiert (Chrome/Android)', () => {
    vi.stubGlobal('window', { NDEFReader: class {} })
    expect(nfcVerfuegbar()).toBe(true)
  })

  it('meldet false wenn window existiert, aber OHNE NDEFReader (echtes iPhone/Desktop)', () => {
    // DER Kern-Fall: window ist ein echtes Objekt, der typeof-Kurzschluss greift NICHT --
    // 'NDEFReader' in window muss also wirklich ausgewertet werden und false liefern.
    vi.stubGlobal('window', {})
    expect(nfcVerfuegbar()).toBe(false)
  })

  it('meldet false wenn window komplett undefined ist (SSR/Node), ohne zu crashen', () => {
    vi.stubGlobal('window', undefined)
    expect(() => nfcVerfuegbar()).not.toThrow()
    expect(nfcVerfuegbar()).toBe(false)
  })
})
