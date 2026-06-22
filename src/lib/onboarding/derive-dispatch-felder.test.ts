import { describe, it, expect } from 'vitest'
import { deriveDispatchLeadFelder } from './derive-dispatch-felder'

// P3b (dispatch-config-unify): der config-getriebene v2-Autosave schreibt nur
// rohe Spalten. Diese Ableitungen ersetzen die Legacy-Actions saveHardGate
// (polizeibericht_pflicht) + saveSchadentyp (unfallort_kategorie), damit der
// Cutover keinen Funktions-Regress (Polizeibericht-Anforderung / Claim-Kategorie)
// erzeugt. Auto-Disqualifikation wird BEWUSST nicht repliziert (v2 = manuelles Flag).
describe('deriveDispatchLeadFelder', () => {
  it('leitet polizeibericht_pflicht=true ab wenn polizei_vor_ort=true gesetzt wird', () => {
    expect(deriveDispatchLeadFelder({ polizei_vor_ort: true }, null)).toEqual({
      polizeibericht_pflicht: true,
    })
  })

  it('leitet polizeibericht_pflicht=false ab wenn polizei_vor_ort=false gesetzt wird', () => {
    expect(deriveDispatchLeadFelder({ polizei_vor_ort: false }, null)).toEqual({
      polizeibericht_pflicht: false,
    })
  })

  it('leitet polizeibericht_pflicht NICHT ab wenn polizei_vor_ort nicht im Payload ist', () => {
    expect(deriveDispatchLeadFelder({ schaden_sichtbar: true }, null)).toEqual({})
  })

  it('leitet unfallort_kategorie=parkluecke aus schadentyp=parkplatz ab (leere Kategorie)', () => {
    expect(deriveDispatchLeadFelder({ schadentyp: 'parkplatz' }, null)).toEqual({
      unfallort_kategorie: 'parkluecke',
    })
  })

  it('leitet unfallort_kategorie=kreuzung aus schadentyp=vorfahrtsverletzung ab', () => {
    expect(deriveDispatchLeadFelder({ schadentyp: 'vorfahrtsverletzung' }, null)).toEqual({
      unfallort_kategorie: 'kreuzung',
    })
  })

  it('leitet KEINE Kategorie ab fuer schadentyp ohne eindeutigen Ort (spurwechsel)', () => {
    expect(deriveDispatchLeadFelder({ schadentyp: 'spurwechsel' }, null)).toEqual({})
  })

  it('ueberschreibt eine bereits gesetzte unfallort_kategorie NICHT', () => {
    expect(deriveDispatchLeadFelder({ schadentyp: 'parkplatz' }, 'innerorts')).toEqual({})
  })

  it('kombiniert polizei- und schadentyp-Ableitung', () => {
    expect(
      deriveDispatchLeadFelder({ polizei_vor_ort: true, schadentyp: 'parkplatz' }, null),
    ).toEqual({ polizeibericht_pflicht: true, unfallort_kategorie: 'parkluecke' })
  })

  it('gibt ein leeres Objekt zurueck wenn nichts Relevantes im Payload ist', () => {
    expect(deriveDispatchLeadFelder({ notiz: 'foo', vorname: 'Max' }, null)).toEqual({})
  })
})
