import { describe, it, expect } from 'vitest'
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
  it('meldet false ohne NDEFReader (jsdom == iPhone/Desktop)', () => {
    expect(nfcVerfuegbar()).toBe(false)
  })
})
