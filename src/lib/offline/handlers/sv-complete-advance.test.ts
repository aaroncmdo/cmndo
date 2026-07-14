import { describe, it, expect, vi, beforeEach } from 'vitest'
const caMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ completeAndAdvance: caMock }))
import { svCompleteAdvanceHandler } from './sv-complete-advance'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'sv_complete_advance', idempotency_key: 'k', replay_class: 'C',
  payload: { sessionId: 's1', terminId: 't1' }, entity_ref: { scope: 'feldmodus-session', id: 's1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => caMock.mockReset())

describe('svCompleteAdvanceHandler', () => {
  it('replays completeAndAdvance with terminId as the CAS expected -> done', async () => {
    caMock.mockResolvedValue({ success: true, nextTerminId: 't2' })
    expect(await svCompleteAdvanceHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(caMock).toHaveBeenCalledWith('s1', 't1', 't1')
  })
  it('skipped (already advanced) still returns done', async () => {
    caMock.mockResolvedValue({ success: true, nextTerminId: null, skipped: true })
    expect(await svCompleteAdvanceHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('failure -> retry', async () => {
    caMock.mockResolvedValue({ success: false, error: 'boom' })
    expect((await svCompleteAdvanceHandler.replay!(op)).outcome).toBe('retry')
  })
})
