import { describe, it, expect } from 'vitest'
import { istFeststellungsFeld } from '../feststellung-felder'

const feld = (over: Partial<{ feld_key: string; typ: string; sektion: string | null }>) => ({
  feld_key: 'x', typ: 'text', sektion: 'schaden', ...over,
})

describe('istFeststellungsFeld', () => {
  it('nimmt deklarative Schaden-Flags', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'personenschaden_flag', typ: 'segmented' }))).toBe(true)
    expect(istFeststellungsFeld(feld({ feld_key: 'schadentyp', typ: 'toggle-cards' }))).toBe(true)
  })
  it('nimmt Kennzeichen + Halter-Toggle aus fahrzeug', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'kennzeichen', sektion: 'fahrzeug' }))).toBe(true)
    expect(istFeststellungsFeld(feld({ feld_key: 'ist_fahrzeughalter', typ: 'segmented', sektion: 'fahrzeug' }))).toBe(true)
  })
  it('schliesst Upload-Typen aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'fahrzeugschein_foto', typ: 'zb1-upload', sektion: 'fahrzeug' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'schadensfotos', typ: 'file' }))).toBe(false)
  })
  it('schliesst OCR-Folgedaten aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'fin', sektion: 'fahrzeug' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'fahrzeug_hersteller', sektion: 'fahrzeug' }))).toBe(false)
  })
  it('schliesst woanders erfasste aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'schuldfrage', typ: 'segmented', sektion: 'schuld' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'vorname', sektion: 'kontakt' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'termin', typ: 'termin', sektion: 'termin_sv' }))).toBe(false)
  })
})
