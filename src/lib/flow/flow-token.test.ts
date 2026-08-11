import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

import { resolveFlowLeadId } from './flow-token'

beforeEach(() => {
  maybeSingle.mockReset()
})

describe('resolveFlowLeadId', () => {
  it('leerer Token -> Fehler', async () => {
    expect(await resolveFlowLeadId('')).toMatchObject({ leadId: null, error: 'Kein Token.' })
  })
  it('gueltiger flow_link -> leadId', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } })
    expect(await resolveFlowLeadId('tok')).toMatchObject({ leadId: 'lead-1' })
  })
  it('abgelaufen -> Fehler', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: '2000-01-01T00:00:00Z' } })
    expect(await resolveFlowLeadId('tok')).toMatchObject({ leadId: null, error: 'Dieser Link ist abgelaufen.' })
  })
})
