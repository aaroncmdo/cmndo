import { describe, it, expect } from 'vitest'
import { readClaimSigningState } from './signing-state'

describe('readClaimSigningState (FG6 dual-SSoT collapse, K3)', () => {
  it('prefers the CLAIM copy when a claim exists', () => {
    const s = readClaimSigningState({
      hasClaim: true,
      claim: { sa_unterschrieben: true, sa_unterschrieben_am: '2026-07-01T10:00:00Z', vollmacht_signiert_am: '2026-07-02T10:00:00Z' },
      lead: { sa_unterschrieben: false, sa_unterschrieben_am: null, vollmacht_signiert_am: null },
    })
    expect(s.saUnterschrieben).toBe(true)
    expect(s.saUnterschriebenAm).toBe('2026-07-01T10:00:00Z')
    expect(s.vollmachtSigniertAm).toBe('2026-07-02T10:00:00Z')
  })

  it('falls back to the LEAD copy pre-conversion (no claim)', () => {
    const s = readClaimSigningState({
      hasClaim: false,
      claim: null,
      lead: { sa_unterschrieben: true, sa_unterschrieben_am: '2026-06-01T10:00:00Z', vollmacht_signiert_am: null },
    })
    expect(s.saUnterschrieben).toBe(true)
    expect(s.saUnterschriebenAm).toBe('2026-06-01T10:00:00Z')
    expect(s.vollmachtSigniertAm).toBeNull()
  })

  it('derives saUnterschrieben from the timestamp (K3) even if the bool is missing', () => {
    const s = readClaimSigningState({ hasClaim: true, claim: { sa_unterschrieben: null, sa_unterschrieben_am: '2026-07-01T10:00:00Z' }, lead: null })
    expect(s.saUnterschrieben).toBe(true)
  })

  it('reports not-signed when neither copy has the fact', () => {
    const s = readClaimSigningState({ hasClaim: true, claim: {}, lead: null })
    expect(s).toEqual({ saUnterschrieben: false, saUnterschriebenAm: null, vollmachtSigniertAm: null })
  })

  it('treats a non-null claim with a signing field as authoritative even if hasClaim is unset', () => {
    const s = readClaimSigningState({
      claim: { vollmacht_signiert_am: '2026-07-05T10:00:00Z' },
      lead: { vollmacht_signiert_am: '2026-06-05T10:00:00Z' },
    })
    expect(s.vollmachtSigniertAm).toBe('2026-07-05T10:00:00Z')
  })
})
