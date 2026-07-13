import { describe, it, expect, vi, beforeEach } from 'vitest'
const markMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/gutachter/feldmodus/actions', () => ({ markSvVorOrt: markMock, markBesichtigungGestartet: vi.fn() }))
import { svVorOrtHandler } from './sv-vor-ort'
import type { OutboxOp } from '../ops'
const op: OutboxOp = {
  id: 1, kind: 'sv_vor_ort', idempotency_key: 'k', replay_class: 'C',
  payload: { terminId: 't1', lat: 1, lng: 2, via: 'geofence' }, entity_ref: { scope: 'feldmodus-termin', id: 't1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => markMock.mockReset())
describe('svVorOrtHandler', () => {
  it('replays markSvVorOrt -> done', async () => {
    markMock.mockResolvedValue({ success: true })
    expect(await svVorOrtHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(markMock).toHaveBeenCalledWith('t1', 1, 2, 'geofence')
  })
  it('optimisticPatch stamps the matching route stop sv_angekommen_am', () => {
    const cur = { stops: [{ termin_id: 't1', sv_angekommen_am: null }, { termin_id: 't2', sv_angekommen_am: null }], session: {} }
    const next = svVorOrtHandler.optimisticPatch!(cur, op) as typeof cur
    expect(next.stops[0].sv_angekommen_am).not.toBeNull()
    expect(next.stops[1].sv_angekommen_am).toBeNull()
  })
})
