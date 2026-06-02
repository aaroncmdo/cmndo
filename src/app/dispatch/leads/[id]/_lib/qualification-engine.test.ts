import { describe, it, expect } from 'vitest'
import { computeQualificationStatus, type LeadLike } from './qualification-engine'

describe('computeQualificationStatus — disqualifiziert (P3a §9)', () => {
  it('phase-basiert (Legacy-Flow): qualifizierungs_phase=disqualifiziert', () => {
    const r = computeQualificationStatus({ qualifizierungs_phase: 'disqualifiziert' }, null)
    expect(r.disqualifiziert).toBe(true)
  })

  it('flag-basiert (v2-Form): leads.disqualifiziert=true', () => {
    const r = computeQualificationStatus({ disqualifiziert: true } as LeadLike, null)
    expect(r.disqualifiziert).toBe(true)
  })

  it('keine Disqualifikation: Phase aktiv + Flag false/leer', () => {
    expect(
      computeQualificationStatus({ qualifizierungs_phase: 'in-qualifizierung', disqualifiziert: false }, null)
        .disqualifiziert,
    ).toBe(false)
    expect(computeQualificationStatus({}, null).disqualifiziert).toBe(false)
  })

  it('disqualifiziert erzwingt allComplete=false', () => {
    // Selbst wenn (theoretisch) alle q erfüllt wären — disqualifiziert blockt allComplete.
    const r = computeQualificationStatus({ disqualifiziert: true } as LeadLike, null)
    expect(r.allComplete).toBe(false)
    expect(r.canSendFlowLink).toBe(false)
  })
})
