// src/lib/status/domains/claims-status.test.ts
import { describe, it, expect } from 'vitest'
import { CLAIMS_STATUS_DEFS } from './claims-status'

describe('CLAIMS_STATUS_DEFS', () => {
  it('exposes admin label + kunde variant', () => {
    const d = CLAIMS_STATUS_DEFS.in_kommunikation_vs
    expect(d.label).toBe('Kommunikation mit VS')
    expect(d.labelByRole?.kunde).toBe('Wir verhandeln mit der Versicherung')
  })
  it('flags terminal states and carries an iconKey', () => {
    expect(CLAIMS_STATUS_DEFS.reguliert_vollstaendig.isEndzustand).toBe(true)
    expect(CLAIMS_STATUS_DEFS.reguliert_vollstaendig.iconKey).toBe('check-circle')
    expect(CLAIMS_STATUS_DEFS.dispatch_done.isEndzustand).toBe(false)
  })
})
