import { describe, it, expect } from 'vitest'
import {
  ZB1_KORREKTUR_FELDER,
  ZB1_GRUPPEN,
  baueZb1Werte,
  leereZb1Werte,
  nurGeaenderte,
} from '../zb1-felder'

describe('ZB1-Felder — eine Liste für alle Oberflächen', () => {
  it('jede Gruppe zeigt nur bekannte Felder, und jedes Feld kommt genau einmal vor', () => {
    const inGruppen = ZB1_GRUPPEN.flatMap((g) => g.felder.map((f) => f.feld))
    expect([...inGruppen].sort()).toEqual([...ZB1_KORREKTUR_FELDER].sort())
    expect(new Set(inGruppen).size).toBe(inGruppen.length)
  })
})

describe('baueZb1Werte', () => {
  it('liest die Schreibweise des OCR-Parsers (fin_vin, halter_vorname/-nachname)', () => {
    const w = baueZb1Werte({
      kennzeichen: 'SP MQ 16',
      fin_vin: 'HMU6910000K234157',
      fahrzeug_hersteller: 'Kia',
      fahrzeug_modell: 'SORENTO',
      halter_vorname: 'Fritzi',
      halter_nachname: 'Fahrer',
      hsn: '8253',
      tsn: 'AIP000047',
    })
    expect(w.kennzeichen).toBe('SP MQ 16')
    expect(w.fin).toBe('HMU6910000K234157')
    expect(w.halter_name).toBe('Fritzi Fahrer')
    expect(w.hsn).toBe('8253')
  })

  it('liest ebenso die Schreibweise der Fahrzeug-Sicht (hersteller, modell_haupttyp, farbe_klartext)', () => {
    const w = baueZb1Werte({
      hersteller: 'Mercedes-Benz',
      modell_haupttyp: 'C 180',
      farbe_klartext: 'SCHWARZ',
      fin: 'WDD2040491A123456',
    })
    expect(w.fahrzeug_hersteller).toBe('Mercedes-Benz')
    expect(w.fahrzeug_modell).toBe('C 180')
    expect(w.fahrzeug_farbe).toBe('SCHWARZ')
    expect(w.fin).toBe('WDD2040491A123456')
  })

  it('ein bereits zusammengesetzter Haltername gewinnt vor den Einzelteilen', () => {
    expect(baueZb1Werte({ halter_name: 'Autohaus Bellemann GmbH', halter_nachname: 'Bellemann' }).halter_name)
      .toBe('Autohaus Bellemann GmbH')
  })

  it('fehlende Quelle ergibt leere, aber vollständige Werte', () => {
    expect(baueZb1Werte(null)).toEqual(leereZb1Werte())
    expect(Object.keys(leereZb1Werte()).sort()).toEqual([...ZB1_KORREKTUR_FELDER].sort())
  })

  it('null und Leerstring werden zu Leerstring, nicht zu "null"', () => {
    const w = baueZb1Werte({ kennzeichen: null, fin_vin: undefined, hsn: '  ' })
    expect(w.kennzeichen).toBe('')
    expect(w.fin).toBe('')
    expect(w.hsn).toBe('')
  })
})

describe('nurGeaenderte', () => {
  it('liefert nur, was der Kunde wirklich geändert hat', () => {
    const vorher = baueZb1Werte({ kennzeichen: 'HB-TL 2026', hersteller: 'Kia' })
    const nachher = { ...vorher, kennzeichen: 'SP MQ 16' }
    expect(nurGeaenderte(vorher, nachher)).toEqual({ kennzeichen: 'SP MQ 16' })
  })

  it('ein geleertes Feld löscht keinen bekannten Wert', () => {
    // Ein Kunde, der ein Feld leert, weil er den Wert nicht kennt, darf damit
    // nicht die vorhandene Angabe aus der Akte entfernen.
    const vorher = baueZb1Werte({ kennzeichen: 'HB-TL 2026', fin_vin: 'HMU6910000K234157' })
    const nachher = { ...vorher, fin: '' }
    expect(nurGeaenderte(vorher, nachher)).toEqual({})
  })

  it('ohne Änderung bleibt nichts übrig', () => {
    const w = baueZb1Werte({ kennzeichen: 'HB-TL 2026' })
    expect(nurGeaenderte(w, { ...w })).toEqual({})
  })

  it('umgebende Leerzeichen zählen nicht als Änderung', () => {
    const w = baueZb1Werte({ kennzeichen: 'HB-TL 2026' })
    expect(nurGeaenderte(w, { ...w, kennzeichen: '  HB-TL 2026  ' })).toEqual({})
  })

  it('ein bislang leeres Feld wird übernommen — der Kunde ergänzt, was die Erkennung nicht fand', () => {
    const vorher = baueZb1Werte({ kennzeichen: 'HB-TL 2026' })
    const nachher = { ...vorher, fin: 'HMU6910000K234157' }
    expect(nurGeaenderte(vorher, nachher)).toEqual({ fin: 'HMU6910000K234157' })
  })
})
