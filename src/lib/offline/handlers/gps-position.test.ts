// src/lib/offline/handlers/gps-position.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gpsPositionHandler } from './gps-position'
import type { OutboxOp } from '../ops'

function op(id: number): OutboxOp {
  return {
    id, kind: 'gps_position', idempotency_key: `g${id}`, replay_class: 'A',
    payload: { sv_id: 's1', termin_id: null, lat: 1, lng: 2, accuracy_m: null, heading: null, speed_kmh: null, captured_at: id },
    status: 'pending', retry_count: 0, last_attempt_at: null, created_at: id,
  }
}

beforeEach(() => vi.restoreAllMocks())

describe('gpsPositionHandler.drainBatch', () => {
  it('posts in chunks of 50 and marks all done on ok', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    const ops = Array.from({ length: 60 }, (_, i) => op(i + 1))
    const res = await gpsPositionHandler.drainBatch!(ops)
    expect(fetchMock).toHaveBeenCalledTimes(2) // 50 + 10
    expect(res.done.length).toBe(60)
    expect(res.failed.length).toBe(0)
  })
  it('marks batch failed on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => 'err' })))
    const res = await gpsPositionHandler.drainBatch!([op(1), op(2)])
    expect(res.done.length).toBe(0)
    expect(res.failed).toEqual([1, 2])
  })
})
