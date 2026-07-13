import { describe, it, expect, vi, beforeEach } from 'vitest'
const markBesMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ markSvVorOrt: vi.fn(), markBesichtigungGestartet: markBesMock }))
import { besichtigungGestartetHandler } from './besichtigung-gestartet'
import type { OutboxOp } from '../ops'
const op: OutboxOp = {
  id: 1, kind: 'besichtigung_gestartet', idempotency_key: 'k', replay_class: 'C',
  payload: { terminId: 't1', sessionId: 's1', via: 'manuell' }, entity_ref: { scope: 'feldmodus-termin', id: 't1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => markBesMock.mockReset())
describe('besichtigungGestartetHandler', () => {
  it('replays markBesichtigungGestartet -> done', async () => {
    markBesMock.mockResolvedValue({ success: true })
    expect(await besichtigungGestartetHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(markBesMock).toHaveBeenCalledWith('s1', 't1', 'manuell')
  })
  it('retry on failure', async () => {
    markBesMock.mockResolvedValue({ success: false, error: 'e' })
    expect((await besichtigungGestartetHandler.replay!(op)).outcome).toBe('retry')
  })
})
