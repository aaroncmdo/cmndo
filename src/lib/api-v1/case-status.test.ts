import { describe, it, expect } from 'vitest'
import { coarseKundeStatus, CASE_STATUS_FALLBACK } from './case-status'

describe('coarseKundeStatus', () => {
  it('mappt operative_status auf ein grobes kunden-Label via Lifecycle-Hauptphase', () => {
    expect(coarseKundeStatus('ersterfassung')).toContain('organisieren') // erfassung
    expect(coarseKundeStatus('sv-termin')).toContain('Begutachtung') // begutachtung
    expect(coarseKundeStatus('gutachten-eingegangen')).toContain('Begutachtung')
    expect(coarseKundeStatus('in_kommunikation_vs')).toContain('Versicherung') // regulierung
  })

  it('unterscheidet die Abschluss-Ausgaenge (nicht pauschal "abgeschlossen")', () => {
    expect(coarseKundeStatus('abgeschlossen')).toContain('erfolgreich')
    expect(coarseKundeStatus('storniert')).toContain('gestoppt')
    expect(coarseKundeStatus('abgelehnt_final')).toContain('abgelehnt')
    // verschiedene Ausgaenge -> verschiedene Labels (kein pauschales "abgeschlossen")
    expect(coarseKundeStatus('storniert')).not.toBe(coarseKundeStatus('abgelehnt_final'))
    expect(coarseKundeStatus('abgeschlossen')).not.toBe(coarseKundeStatus('storniert'))
  })

  it('null/undefined/unbekannt -> Fallback (Lead noch nicht in Claim / nicht gemappt)', () => {
    expect(coarseKundeStatus(null)).toBe(CASE_STATUS_FALLBACK)
    expect(coarseKundeStatus(undefined)).toBe(CASE_STATUS_FALLBACK)
    expect(coarseKundeStatus('kein_echter_status_xyz')).toBe(CASE_STATUS_FALLBACK)
    expect(coarseKundeStatus('')).toBe(CASE_STATUS_FALLBACK)
  })

  it('gibt NIE den rohen Code oder internes Fach-Jargon zurueck (PII-/Jargon-Schutz)', () => {
    expect(coarseKundeStatus('filmcheck')).not.toBe('filmcheck')
    expect(coarseKundeStatus('filmcheck')).not.toContain('Filmcheck') // internes SUBPHASE_LABEL vermieden
    expect(coarseKundeStatus('qc-pruefung')).not.toContain('QC')
    // filmcheck/qc-pruefung sind Begutachtungs-Sub-States -> das grobe Begutachtungs-Label
    expect(coarseKundeStatus('filmcheck')).toContain('Begutachtung')
    expect(coarseKundeStatus('qc-pruefung')).toContain('Begutachtung')
  })
})
