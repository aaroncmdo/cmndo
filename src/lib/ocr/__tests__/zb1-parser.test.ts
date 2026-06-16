import { describe, it, expect } from 'vitest'
import { parseZB1Fields, splitHalterName } from '../zb1-parser'

// Realistischer Google-Vision-fullTextAnnotation-Output eines Fahrzeugscheins
// (ZB1): Feld-Label auf eigener Zeile, Wert in der naechsten Zeile — genau das
// Layout, das parseZB1Fields ueber die ^A$/^B$/^C.1$/^D.1$/... -Anker erwartet.
const ZB1_SAMPLE = `Zulassungsbescheinigung Teil I
A
K-AB 1234
B
15.03.2019
C.1.1
Mustermann, Max
C.3
Musterstraße 12
50667 Köln
D.1
BMW
D.3
320d
2.1
0005
2.2
ABC
R
SCHWARZ
WVWZZZ1KZAW123456`

describe('parseZB1Fields (OCR-Smoke)', () => {
  it('extrahiert alle Kernfelder aus realistischem ZB1-Vision-Text', () => {
    const r = parseZB1Fields(ZB1_SAMPLE)
    expect(r.kennzeichen).toBe('K-AB 1234')
    expect(r.erstzulassung).toBe('15.03.2019')
    expect(r.fahrzeug_baujahr).toBe(2019) // aus Erstzulassung abgeleitet (AAR-181)
    expect(r.halter_nachname).toBe('Mustermann')
    expect(r.halter_vorname).toBe('Max')
    expect(r.halter_strasse).toBe('Musterstraße 12')
    expect(r.halter_plz).toBe('50667')
    expect(r.halter_stadt).toBe('Köln')
    expect(r.fahrzeug_hersteller).toBe('BMW')
    expect(r.fahrzeug_modell).toBe('320d')
    expect(r.fahrzeug_farbe).toBe('SCHWARZ')
    expect(r.fin_vin).toBe('WVWZZZ1KZAW123456')
    expect(r.hsn).toBe('0005')
    expect(r.tsn).toBe('ABC')
  })

  it('Hersteller-Keyword-Fallback (kein D.1-Label, Klartext im Fliesstext)', () => {
    // OCR liefert die Feld-Codes oft nicht auf eigenen Zeilen — dann greift der
    // HERSTELLER_KEYWORDS-Fallback (AAR-351), inkl. "BAYER.MOT.WERKE" → BMW.
    const r = parseZB1Fields('irgendwas BAYER.MOT.WERKE 320d weiterer Text')
    expect(r.fahrzeug_hersteller).toBe('BMW')
  })

  it('Erstzulassung-Fallback nimmt das aelteste plausible Datum', () => {
    // Ausstellungsdatum (I.1) + TUEV liegen nach der Erstzulassung → aeltestes gewinnt.
    const r = parseZB1Fields('Ausstellung 20.06.2023\nTUEV 03.2025\nErstzulassung 11.08.2018')
    expect(r.erstzulassung).toBe('11.08.2018')
    expect(r.fahrzeug_baujahr).toBe(2018)
  })

  it('leerer / unlesbarer Text → alle Felder null (kein Crash)', () => {
    const r = parseZB1Fields('')
    expect(r.fin_vin).toBeNull()
    expect(r.kennzeichen).toBeNull()
    expect(r.halter_nachname).toBeNull()
  })
})

describe('splitHalterName', () => {
  it('ZB1-Standard "NACHNAME, VORNAME"', () => {
    expect(splitHalterName('Mustermann, Max')).toEqual({ nachname: 'Mustermann', vorname: 'Max' })
  })
  it('UPPERCASE ohne Komma (DIN) → erstes Token = Nachname', () => {
    expect(splitHalterName('MUSTERMANN MAX')).toEqual({ nachname: 'MUSTERMANN', vorname: 'MAX' })
  })
  it('Mixedcase "Max Mustermann" → letztes Token = Nachname', () => {
    expect(splitHalterName('Max Mustermann')).toEqual({ nachname: 'Mustermann', vorname: 'Max' })
  })
  it('Adelspraefix bleibt am Nachnamen kleben', () => {
    expect(splitHalterName('von der Heide, Peter')).toEqual({ nachname: 'von der Heide', vorname: 'Peter' })
  })
  it('Einzelner Name → nur Nachname', () => {
    expect(splitHalterName('Mustermann')).toEqual({ nachname: 'Mustermann', vorname: null })
  })
})
