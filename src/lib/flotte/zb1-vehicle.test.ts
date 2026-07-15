import { describe, it, expect } from 'vitest'
import { zb1ToVehicleSnapshot, zb1ToFelder, felderToSnapshot } from './zb1-vehicle'
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'
import type { EditierbareFahrzeugFelder } from './zb1-vehicle'

const leer: ZB1ExtractedData = {
  kennzeichen: null, erstzulassung: null, fahrzeug_baujahr: null,
  halter_nachname: null, halter_vorname: null, halter_strasse: null, halter_plz: null, halter_stadt: null,
  fahrzeug_hersteller: null, fahrzeug_modell: null, fahrzeug_farbe: null,
  fin_vin: null, hsn: null, tsn: null, brn: null, fahrzeugklasse: null,
}

describe('zb1ToVehicleSnapshot', () => {
  it('mappt die ZB1-Felder auf den VehicleSnapshot + setzt finQuelle', () => {
    const snap = zb1ToVehicleSnapshot({
      ...leer,
      kennzeichen: 'K-AB 1234', fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
      hsn: '0005', tsn: 'ABC', fahrzeug_farbe: 'Schwarz', fahrzeug_baujahr: 2020, erstzulassung: '2020-03-01',
    })
    expect(snap).toMatchObject({
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      finQuelle: 'zb1_ocr',
    })
  })

  it('die FIN wandert NICHT in den Snapshot (ensureVehicleFromFin nimmt sie separat)', () => {
    const snap = zb1ToVehicleSnapshot({ ...leer, fin_vin: 'WBA12345678901234' })
    expect(snap).not.toHaveProperty('fin')
  })

  it('leere ZB1 → Snapshot mit nur finQuelle (alle anderen null/undefined)', () => {
    const snap = zb1ToVehicleSnapshot(leer)
    expect(snap.finQuelle).toBe('zb1_ocr')
    expect(snap.kennzeichen ?? null).toBeNull()
  })
})

describe('zb1ToFelder', () => {
  it('mappt ZB1-Felder auf EditierbareFahrzeugFelder (mit fin_vin)', () => {
    const felder = zb1ToFelder({
      ...leer,
      fin_vin: 'WBA12345678901234',
      kennzeichen: 'K-AB 1234', fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
      hsn: '0005', tsn: 'ABC', fahrzeug_farbe: 'Schwarz', fahrzeug_baujahr: 2020, erstzulassung: '2020-03-01',
    })
    expect(felder).toMatchObject({
      fin: 'WBA12345678901234',
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
    })
  })

  it('fuehrt fahrzeugklasse mit (Spec B: harter Werkstatt-Matching-Filter, ZB1-Feld J)', () => {
    const felder = zb1ToFelder({ ...leer, fahrzeugklasse: 'M1' })
    expect(felder.fahrzeugklasse).toBe('M1')
  })

  it('leere fahrzeugklasse bleibt null', () => {
    const felder = zb1ToFelder(leer)
    expect(felder.fahrzeugklasse).toBeNull()
  })
})

describe('felderToSnapshot', () => {
  it('mappt editierte Fahrzeugfelder auf VehicleSnapshot (ohne fin, finQuelle gesetzt)', () => {
    const felder: EditierbareFahrzeugFelder = {
      fin: 'WBA12345678901234',
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      fahrzeugklasse: 'M1',
    }
    const snap = felderToSnapshot(felder)
    expect(snap).toMatchObject({
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      finQuelle: 'zb1_ocr',
    })
  })

  it('die FIN wandert NICHT in den Snapshot (wird separat behandelt)', () => {
    const felder: EditierbareFahrzeugFelder = {
      fin: 'WBA12345678901234',
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      fahrzeugklasse: 'M1',
    }
    const snap = felderToSnapshot(felder)
    expect(snap).not.toHaveProperty('fin')
  })

  it('die fahrzeugklasse wandert NICHT in den Snapshot (Write-Path kennt sie noch nicht, s. zb1-vehicle.ts)', () => {
    const felder: EditierbareFahrzeugFelder = {
      fin: 'WBA12345678901234',
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      fahrzeugklasse: 'M1',
    }
    const snap = felderToSnapshot(felder)
    expect(snap).not.toHaveProperty('fahrzeugklasse')
  })

  it('leere Felder → Snapshot mit nur finQuelle', () => {
    const felder: EditierbareFahrzeugFelder = {
      fin: null,
      kennzeichen: null, hersteller: null, modell: null,
      hsn: null, tsn: null, farbe: null, baujahr: null, erstzulassung: null,
      fahrzeugklasse: null,
    }
    const snap = felderToSnapshot(felder)
    expect(snap.finQuelle).toBe('zb1_ocr')
    expect(snap.kennzeichen ?? null).toBeNull()
  })
})
