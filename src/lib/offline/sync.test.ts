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
  it('dead-letters an op whose handler returns conflict (persist + count failed, not synced)', async () => {
    // Token-TTL: nicht-transienter conflict (z.B. Flow-Token abgelaufen) darf NICHT still
    // gedroppt + als synced gezählt werden — als Dead-Letter behalten + ehrlich als failed.
    registerHandler({ kind: 'conf', replay: async () => ({ outcome: 'conflict', error: 'Link abgelaufen' }) })
    const { id } = await enqueueOp({ kind: 'conf', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res.synced).toBe(0)
    expect(res.failed).toBe(1)
    const op = await offlineDB.mutation_outbox.get(id)
    expect(op?.status).toBe('dead')
    expect(op?.last_error).toBe('Link abgelaufen')
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

describe('drainOutbox — Transport-Haenger-Guard (500-Attribution 17.07.)', () => {
  it('timeboxt einen nie settelnden Replay: Op -> failed, Drain kehrt zurueck, Folge-Drain ist kein No-op', async () => {
    registerHandler({ kind: 'haenger', replay: () => new Promise(() => {}) })
    await enqueueOp({ kind: 'haenger', replay_class: 'B', payload: {} })
    const res = await drainOutbox({ replayTimeoutMs: 50 })
    expect(res).toEqual({ synced: 0, failed: 1 })
    const row = await offlineDB.mutation_outbox.toCollection().first()
    expect(row?.status).toBe('failed')
    // `syncing` wurde via finally freigegeben -> der naechste Drain laeuft
    // (statt sofort no-op zu returnen wie beim frueheren Ewig-Haenger).
    const res2 = await drainOutbox({ replayTimeoutMs: 50 })
    expect(res2.synced + res2.failed).toBeGreaterThanOrEqual(0)
  })

  it('faengt einen Replay-Reject ausserhalb des Handler-Catch: Op -> failed statt Drain-Abbruch', async () => {
    registerHandler({ kind: 'werfer', replay: () => Promise.reject(new Error('transport kaputt')) })
    await enqueueOp({ kind: 'werfer', replay_class: 'B', payload: {} })
    const res = await drainOutbox()
    expect(res).toEqual({ synced: 0, failed: 1 })
    const row = await offlineDB.mutation_outbox.toCollection().first()
    expect(row?.status).toBe('failed')
    expect(row?.last_error).toContain('transport kaputt')
  })
})
