// src/lib/offline/sync.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { offlineDB } from './db'
import { enqueueOp } from './enqueue'
import { registerHandler, clearHandlers } from './registry'
import { drainOutbox } from './sync'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
  clearHandlers()
})

describe('drainOutbox — single replay', () => {
  it('removes an op whose handler returns done', async () => {
    registerHandler({ kind: 'ok', replay: async () => ({ outcome: 'done' }) })
    await enqueueOp({ kind: 'ok', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res.synced).toBe(1)
    expect(await offlineDB.mutation_outbox.count()).toBe(0)
  })
  it('keeps + marks failed an op whose handler returns retry', async () => {
    registerHandler({ kind: 'bad', replay: async () => ({ outcome: 'retry', error: 'x' }) })
    const { id } = await enqueueOp({ kind: 'bad', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res.failed).toBe(1)
    expect((await offlineDB.mutation_outbox.get(id))?.status).toBe('failed')
  })
})

describe('drainOutbox — batch replay', () => {
  it('passes grouped ops to drainBatch and removes the done ids', async () => {
    const seen = vi.fn()
    registerHandler({
      kind: 'batch',
      drainBatch: async (ops) => {
        seen(ops.length)
        return { done: ops.map((o) => o.id!), failed: [] }
      },
    })
    await enqueueOp({ kind: 'batch', replay_class: 'A', payload: { n: 1 } })
    await enqueueOp({ kind: 'batch', replay_class: 'A', payload: { n: 2 } })
    const res = await drainOutbox()
    expect(seen).toHaveBeenCalledWith(2)
    expect(res.synced).toBe(2)
    expect(await offlineDB.mutation_outbox.count()).toBe(0)
  })
})
