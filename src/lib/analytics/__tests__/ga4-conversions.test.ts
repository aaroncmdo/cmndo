import { describe, it, expect } from 'vitest'
import { buildSaSignedEvent, SA_SIGNED_VALUE_EUR } from '../ga4-conversions'

describe('buildSaSignedEvent', () => {
  it('baut das sa_signed-Event beim Uebergang (noch nicht unterschrieben)', () => {
    const event = buildSaSignedEvent({ alreadySigned: false, leadId: 'lead_123', source: 'flow' })
    expect(event).not.toBeNull()
    expect(event?.name).toBe('sa_signed')
    expect(event?.params).toMatchObject({
      source: 'flow',
      value: SA_SIGNED_VALUE_EUR,
      currency: 'EUR',
      transaction_id: 'lead_123',
    })
  })

  it('liefert null wenn die SA bereits unterschrieben war (Dedup an der Quelle)', () => {
    expect(buildSaSignedEvent({ alreadySigned: true, leadId: 'lead_123', source: 'flow' })).toBeNull()
  })

  it('reicht die source + transaction_id fuer den GF-Pfad durch', () => {
    const event = buildSaSignedEvent({ alreadySigned: false, leadId: 'gfa_9', source: 'gutachter_finder' })
    expect(event?.params?.source).toBe('gutachter_finder')
    expect(event?.params?.transaction_id).toBe('gfa_9')
  })
})
