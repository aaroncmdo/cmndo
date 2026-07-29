import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSpy = vi.fn()
const selects: Record<string, unknown> = {}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: unknown) => { insertSpy(row); return { select: () => ({ single: () => ({ data: { id: 'new-id' }, error: null }) }) } },
      select: () => ({ eq: () => ({ order: () => ({ data: selects.rows ?? [], error: null }) }) }),
    }),
  }),
}))

import { persistCopilotProposals } from './proposals'

beforeEach(() => insertSpy.mockClear())

describe('persistCopilotProposals', () => {
  it('persistiert draft mit quelle=copilot', async () => {
    const ids = await persistCopilotProposals('claim-1', 'claude-sonnet-5', [
      { vorschlagTyp: 'add_note', zielRolle: null, payload: { titel: 'X', text: 'Y' }, begruendung: 'z' },
    ])
    expect(ids).toEqual(['new-id'])
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      claim_id: 'claim-1', vorschlag_typ: 'add_note', quelle: 'copilot', begruendung: 'z',
    }))
  })
})
