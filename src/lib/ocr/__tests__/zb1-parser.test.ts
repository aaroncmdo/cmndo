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

// Spec B (Aaron 14.07.): ZB1-Feld J = EU-/KBA-Fahrzeugklasse. Sie ist der HARTE Filter fuers
// Werkstatt-Matching (eine PKW-Werkstatt repariert keinen LKW) und steht in JEDEM Fahrzeugschein —
// wir haben sie nur nie ausgelesen. Kein KI noetig, keine Schwacke-Lizenz.
describe('parseZB1Fields — Feld J (EU-Fahrzeugklasse, Werkstatt-Matching)', () => {
  it('extrahiert M1 (PKW)', () => {
    expect(parseZB1Fields('A\nK-AB 1234\nJ\nM1\nD.1\nBMW').fahrzeugklasse).toBe('M1')
  })

  it('extrahiert N1 (Transporter) und N2 (LKW)', () => {
    expect(parseZB1Fields('J\nN1').fahrzeugklasse).toBe('N1')
    expect(parseZB1Fields('J\nN2').fahrzeugklasse).toBe('N2')
  })

  it('extrahiert L3e (Motorrad) — das kleine e bleibt erhalten', () => {
    expect(parseZB1Fields('J\nL3e').fahrzeugklasse).toBe('L3e')
    // OCR liefert oft Grossbuchstaben -> auf das Tabellen-Vokabular normalisieren.
    expect(parseZB1Fields('J\nL3E').fahrzeugklasse).toBe('L3e')
  })

  it('extrahiert Anhaenger-Klassen (O1-O4)', () => {
    expect(parseZB1Fields('J\nO2').fahrzeugklasse).toBe('O2')
  })

  // fahrzeugklassen kennt T/C/R/S — die Reparatur-Gruppe (land_forst) ist fuer T1..T4 dieselbe.
  it('normalisiert Land-/Forst-Klassen auf den Buchstaben (T1 -> T)', () => {
    expect(parseZB1Fields('J\nT1').fahrzeugklasse).toBe('T')
    expect(parseZB1Fields('J\nC3').fahrzeugklasse).toBe('C')
  })

  it('ohne gueltige Klasse hinter J -> null (kein Muell in die DB)', () => {
    expect(parseZB1Fields('J\nirgendwas').fahrzeugklasse).toBeNull()
  })

  it('ohne Feld J -> null (aeltere Scheine / schlechter Scan)', () => {
    expect(parseZB1Fields(ZB1_SAMPLE).fahrzeugklasse).toBeNull()
  })
})

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
