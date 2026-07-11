import { describe, expect, it } from 'vitest'
import { darfSehen, getSichtbarFuerRolle } from './sichtbarkeit'

describe('sichtbarkeit', () => {
  it('SV sieht: sa_vollmacht (Task C1 — volle Transparenz-Entscheid Aaron 11.07.)', () => {
    expect(darfSehen('sa_vollmacht', 'sachverstaendiger')).toBe(true)
  })

  it('SV sieht: sicherungsabtretung (Task C1 — volle Transparenz-Entscheid Aaron 11.07.)', () => {
    expect(darfSehen('sicherungsabtretung', 'sachverstaendiger')).toBe(true)
  })

  it('sa_vollmacht + sicherungsabtretung: andere Mandats-interne Typen NICHT veraendert', () => {
    // kanzlei_vollmacht / mandatsvertrag / halter_vollmacht bleiben SV-NICHT
    expect(darfSehen('kanzlei_vollmacht', 'sachverstaendiger')).toBe(false)
    expect(darfSehen('mandatsvertrag', 'sachverstaendiger')).toBe(false)
    expect(darfSehen('halter_vollmacht', 'sachverstaendiger')).toBe(false)
  })

  it('SV sieht NICHT: ki_kalkulation', () => {
    expect(darfSehen('ki_kalkulation', 'sachverstaendiger')).toBe(false)
  })

  it('SV sieht NICHT: kanzlei_paket', () => {
    expect(darfSehen('kanzlei_paket', 'sachverstaendiger')).toBe(false)
  })

  it('SV sieht: gutachten', () => {
    expect(darfSehen('gutachten', 'sachverstaendiger')).toBe(true)
  })

  it('SV sieht: vorschaden_bericht (Kunde NICHT)', () => {
    expect(darfSehen('vorschaden_bericht', 'sachverstaendiger')).toBe(true)
    expect(darfSehen('vorschaden_bericht', 'kunde')).toBe(false)
  })

  it('Dispatcher sieht NICHT: gutachten', () => {
    expect(darfSehen('gutachten', 'dispatch')).toBe(false)
  })

  it('zeugenbericht sichtbar fuer SV/KB/Kanzlei/Kunde (Audit #3 Fix)', () => {
    expect(darfSehen('zeugenbericht', 'sachverstaendiger')).toBe(true)
    expect(darfSehen('zeugenbericht', 'kundenbetreuer')).toBe(true)
    expect(darfSehen('zeugenbericht', 'kanzlei')).toBe(true)
    expect(darfSehen('zeugenbericht', 'kunde')).toBe(true)
  })

  it('Unbekannter Typ: nur Admin', () => {
    expect(darfSehen('existiert_nicht', 'admin')).toBe(true)
    expect(darfSehen('existiert_nicht', 'sachverstaendiger')).toBe(false)
  })

  it('getSichtbarFuerRolle filtert Array korrekt (Task C1: sa_vollmacht jetzt SV-sichtbar)', () => {
    const docs = [
      { typ: 'gutachten' },
      { typ: 'sa_vollmacht' },
      { typ: 'schadensfotos' },
      { typ: 'ki_kalkulation' },
    ]
    const svDocs = getSichtbarFuerRolle(docs, 'sachverstaendiger')
    // sa_vollmacht ist seit Task C1 SV-sichtbar; ki_kalkulation bleibt ausgeschlossen
    expect(svDocs.map((d) => d.typ)).toEqual(['gutachten', 'sa_vollmacht', 'schadensfotos'])
  })

  it('getSichtbarFuerRolle unterstützt dokument_typ + kategorie', () => {
    const docs = [
      { dokument_typ: 'gutachten' },
      { kategorie: 'vorschaden_bericht' },
    ]
    const svDocs = getSichtbarFuerRolle(docs, 'sachverstaendiger')
    expect(svDocs).toHaveLength(2)
  })

  it('sichtbar_fuer (DB-Array) überschreibt Code-Map', () => {
    const docs = [
      // ki_kalkulation wäre normal SV-NICHT, aber sichtbar_fuer enthält SV explicit
      { typ: 'ki_kalkulation', sichtbar_fuer: ['sachverstaendiger'] },
    ]
    const svDocs = getSichtbarFuerRolle(docs, 'sachverstaendiger')
    expect(svDocs).toHaveLength(1)
  })
})
