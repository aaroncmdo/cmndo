import { describe, it, expect } from 'vitest'
import { getSichtbarFuerRolle, darfSehen } from '../sichtbarkeit'

// Minimal-Dokument-Fixture
function dok(typ: string, sichtbar_fuer?: string[]) {
  return { typ, dokument_typ: typ, sichtbar_fuer: sichtbar_fuer ?? null }
}

describe('getSichtbarFuerRolle — Kunde-Sichtbarkeit', () => {
  it('filtert interne Typen aus der Kunde-Liste (abrechnung_intern)', () => {
    const liste = [dok('abrechnung_intern'), dok('gutachten')]
    const result = getSichtbarFuerRolle(liste, 'kunde')
    expect(result.map((d) => d.typ)).toEqual(['gutachten'])
  })

  it('filtert ki_kalkulation, kanzlei_paket, gutachter_fotos, vorschaden_bericht', () => {
    const intern = ['ki_kalkulation', 'kanzlei_paket', 'gutachter_fotos', 'vorschaden_bericht']
    const liste = intern.map((t) => dok(t))
    expect(getSichtbarFuerRolle(liste, 'kunde')).toHaveLength(0)
  })

  it('behält Kunde-sichtbare Typen: gutachten, sicherungsabtretung, anspruchsschreiben, rechnung_gutachten', () => {
    const sichtbar = ['gutachten', 'sicherungsabtretung', 'anspruchsschreiben', 'rechnung_gutachten']
    const liste = sichtbar.map((t) => dok(t))
    const result = getSichtbarFuerRolle(liste, 'kunde')
    expect(result.map((d) => d.typ)).toEqual(sichtbar)
  })

  it('schlussrechnung ist nicht in der Map — fällt auf admin-only (BelegePaketCard nutzt curated URL, nicht die Liste)', () => {
    // schlussrechnungUrl wird aus der unflitrierten lokalen dokumente-Variable abgeleitet (typ-spezifisch),
    // NICHT aus vm.doks.dokumente (der gefilterten Liste). Daher ist dieser fail-safe korrekt.
    expect(darfSehen('schlussrechnung', 'kunde')).toBe(false)
    expect(darfSehen('schlussrechnung', 'admin')).toBe(true)
  })

  it('priorisiert sichtbar_fuer DB-Array über die Code-Map', () => {
    // abrechnung_intern ist laut Map intern-only, aber wenn DB-Array 'kunde' enthält -> sichtbar
    const d = { typ: 'abrechnung_intern', dokument_typ: 'abrechnung_intern', sichtbar_fuer: ['admin', 'kunde'] }
    expect(getSichtbarFuerRolle([d], 'kunde')).toHaveLength(1)
  })

  it('unbekannter Typ fällt auf admin-only (fail-safe)', () => {
    const d = dok('unbekannter_typ_xyz')
    expect(getSichtbarFuerRolle([d], 'kunde')).toHaveLength(0)
    expect(getSichtbarFuerRolle([d], 'admin')).toHaveLength(1)
  })

  it('leere Liste bleibt leer', () => {
    expect(getSichtbarFuerRolle([], 'kunde')).toEqual([])
  })

  it('rechnung_kanzlei ist nicht Kunde-sichtbar', () => {
    expect(darfSehen('rechnung_kanzlei', 'kunde')).toBe(false)
    expect(darfSehen('rechnung_kanzlei', 'kanzlei')).toBe(true)
  })

  it('filmcheck_notizen ist nur admin+kb sichtbar', () => {
    expect(darfSehen('filmcheck_notizen', 'kunde')).toBe(false)
    expect(darfSehen('filmcheck_notizen', 'sachverstaendiger')).toBe(false)
    expect(darfSehen('filmcheck_notizen', 'admin')).toBe(true)
    expect(darfSehen('filmcheck_notizen', 'kundenbetreuer')).toBe(true)
  })
})
