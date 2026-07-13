import { describe, it, expect } from 'vitest'
import { werkstattAuftragSegment } from '../werkstatt-auftrag-segment'

// SegmentInput = { meine_rolle: string | null; reparatur_werkstatt_id: string | null }
// No additional required fields — the two fields below fully satisfy the type.

describe('werkstattAuftragSegment — Bug-B-Regression: Rollen sauber getrennt', () => {
  it('reparateur → reparatur-Tab', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'reparateur', reparatur_werkstatt_id: 'x' })).toBe('reparatur')
  })
  it('beide → reparatur-Tab', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'beide', reparatur_werkstatt_id: 'x' })).toBe('reparatur')
  })
  it('vermittler → vermittlung-Tab (NICHT reparatur)', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'vermittler', reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
})
