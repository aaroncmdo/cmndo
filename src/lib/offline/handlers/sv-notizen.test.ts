import { describe, it, expect, vi, beforeEach } from 'vitest'
const saveMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/gutachter/feldmodus/_fallakte/actions', () => ({ saveFeldmodusNotizen: saveMock }))
import { svNotizenHandler } from './sv-notizen'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'sv_notizen_vor_ort', idempotency_key: 'k', replay_class: 'B',
  payload: { fallId: 'f1', notizen: 'hallo' }, entity_ref: { scope: 'feldmodus-fallakte', id: 'f1' },
  status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}
beforeEach(() => saveMock.mockReset())

describe('svNotizenHandler', () => {
  it('replay calls saveFeldmodusNotizen and returns done on success', async () => {
    saveMock.mockResolvedValue({ success: true })
    expect(await svNotizenHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(saveMock).toHaveBeenCalledWith('f1', 'hallo')
  })
  it('returns retry on failure', async () => {
    saveMock.mockResolvedValue({ success: false, error: 'x' })
    expect((await svNotizenHandler.replay!(op)).outcome).toBe('retry')
  })
  it('optimisticPatch sets fall.sv_notizen_vor_ort', () => {
    const cur = { fall: { sv_notizen_vor_ort: 'old' }, slots: [] }
    const next = svNotizenHandler.optimisticPatch!(cur, op) as typeof cur
    expect(next.fall.sv_notizen_vor_ort).toBe('hallo')
  })
})
