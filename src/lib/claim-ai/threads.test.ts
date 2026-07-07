import { describe, it, expect, vi } from 'vitest'

const insertSpy = vi.fn()
const updateSpy = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }) }) }),
      insert: (row: unknown) => { insertSpy(row); return { error: null } },
      update: (row: unknown) => { updateSpy(row); return { eq: () => ({ error: null }) } },
    }),
  }),
}))

import { appendTurns } from './threads'

it('inserted neuen Thread wenn keiner existiert', async () => {
  await appendTurns('claim-1', 'admin', 'user-1', [{ role: 'user', content: 'hi', ts: '2026-07-07T10:00:00Z' }])
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ claim_id: 'claim-1', rolle: 'admin', user_id: 'user-1' }))
  expect(updateSpy).not.toHaveBeenCalled()
})
