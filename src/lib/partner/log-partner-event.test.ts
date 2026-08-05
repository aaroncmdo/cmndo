import { describe, it, expect } from 'vitest'
import { buildPartnerEventRow } from './log-partner-event'

describe('buildPartnerEventRow', () => {
  it('marks the row as a system event with no author', () => {
    const row = buildPartnerEventRow({
      partnerTyp: 'sv', partnerId: 'sv-1', typ: 'freigeschaltet', text: 'SV freigeschaltet',
    })
    expect(row).toEqual({
      partner_typ: 'sv', partner_id: 'sv-1', typ: 'freigeschaltet',
      text: 'SV freigeschaltet', meta: null, ist_system: true, erstellt_von: null,
    })
  })
  it('passes through meta when provided', () => {
    const row = buildPartnerEventRow({
      partnerTyp: 'werkstatt', partnerId: 'w-1', typ: 'verifiziert', text: 'ok', meta: { by: 'admin' },
    })
    expect(row.meta).toEqual({ by: 'admin' })
    expect(row.ist_system).toBe(true)
  })
})
