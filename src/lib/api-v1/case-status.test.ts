import { describe, it, expect } from 'vitest'
import { coarseKundeStatus, CASE_STATUS_FALLBACK } from './case-status'

describe('coarseKundeStatus', () => {
  it('mappt bekannten operative_status auf das kunde-Label', () => {
    expect(coarseKundeStatus('in_kommunikation_vs')).toBe('Wir verhandeln mit der Versicherung')
    expect(coarseKundeStatus('dispatch_done')).toBe('Neu eingegangen')
  })

  it('null/undefined -> Fallback (Lead noch nicht in einen Claim konvertiert)', () => {
    expect(coarseKundeStatus(null)).toBe(CASE_STATUS_FALLBACK)
    expect(coarseKundeStatus(undefined)).toBe(CASE_STATUS_FALLBACK)
  })

  it('unbekannter Code -> Fallback (kein roher Code-Leak in den Chat)', () => {
    expect(coarseKundeStatus('kein_echter_status_xyz')).toBe(CASE_STATUS_FALLBACK)
    expect(coarseKundeStatus('')).toBe(CASE_STATUS_FALLBACK)
  })

  it('gibt NIE den rohen operative_status-Code zurueck (PII-/Taxonomie-Schutz)', () => {
    expect(coarseKundeStatus('dispatch_done')).not.toBe('dispatch_done')
    expect(coarseKundeStatus('in_kommunikation_vs')).not.toBe('in_kommunikation_vs')
  })
})
