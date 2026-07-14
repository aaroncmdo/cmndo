import { describe, it, expect, vi, beforeEach } from 'vitest'

const { eqCalls, rowRef } = vi.hoisted(() => {
  const eqCalls: Array<[string, unknown]> = []
  const rowRef = { value: null as { id: string; konvertiert_zu_claim_id: string | null } | null }
  return { eqCalls, rowRef }
})

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return b
      }
      b.gt = () => b
      b.order = () => b
      b.limit = () => b
      b.maybeSingle = () => Promise.resolve({ data: rowRef.value, error: null })
      return b
    },
  }),
}))

import { findRecentGegnerLead } from '../recent-lead-dedup'

beforeEach(() => {
  eqCalls.length = 0
  rowRef.value = null
})

describe('findRecentGegnerLead', () => {
  it('filtert auf vehicle_id + gegner_telefon + source_channel=schaden-karte', async () => {
    rowRef.value = { id: 'lead-1', konvertiert_zu_claim_id: 'claim-1' }
    const res = await findRecentGegnerLead('veh-1', '+491701234567')

    expect(res).toEqual({ leadId: 'lead-1', claimId: 'claim-1' })
    expect(eqCalls).toContainEqual(['vehicle_id', 'veh-1'])
    expect(eqCalls).toContainEqual(['gegner_telefon', '+491701234567'])
    expect(eqCalls).toContainEqual(['source_channel', 'schaden-karte'])
  })

  it('kein frischer Lead -> null', async () => {
    rowRef.value = null
    expect(await findRecentGegnerLead('veh-1', '+491701234567')).toBeNull()
  })

  it('noch nicht konvertierter Lead -> claimId null (Draft-Fall)', async () => {
    rowRef.value = { id: 'lead-2', konvertiert_zu_claim_id: null }
    expect(await findRecentGegnerLead('veh-1', '+491701234567')).toEqual({ leadId: 'lead-2', claimId: null })
  })

  it('ohne vehicle_id oder Nummer -> null, kein DB-Call', async () => {
    expect(await findRecentGegnerLead('', '+491701234567')).toBeNull()
    expect(await findRecentGegnerLead('veh-1', '  ')).toBeNull()
    expect(eqCalls).toHaveLength(0)
  })
})
