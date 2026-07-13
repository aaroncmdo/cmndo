// src/lib/offline/enqueue.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { offlineDB } from './db'
import { enqueueOp, markOp, getPendingOps, getPendingCountByKind, getDeadCount, recoverOutbox } from './enqueue'
import { MAX_RETRIES } from './ops'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
})

describe('enqueueOp', () => {
  it('adds a pending op with a generated idempotency_key', async () => {
    const { id, idempotency_key } = await enqueueOp({
      kind: 'demo', replay_class: 'B', payload: { a: 1 },
    })
    expect(id).toBeGreaterThan(0)
    expect(idempotency_key).toMatch(/[0-9a-f-]{36}/)
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.status).toBe('pending')
    expect(await getPendingCountByKind(['demo'])).toBe(1)
  })
})

describe('markOp', () => {
  it('increments retry and dead-letters at MAX_RETRIES', async () => {
    const { id } = await enqueueOp({ kind: 'demo', replay_class: 'A', payload: {} })
    for (let i = 0; i < MAX_RETRIES; i++) await markOp(id, 'failed', 'boom')
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.status).toBe('dead')
    expect(await getDeadCount()).toBe(1)
  })
})

describe('recoverOutbox', () => {
  it('resets stuck uploading rows to pending', async () => {
    const { id } = await enqueueOp({ kind: 'demo', replay_class: 'A', payload: {} })
    await markOp(id, 'uploading')
    const n = await recoverOutbox()
    expect(n).toBe(1)
    expect((await getPendingOps()).length).toBe(1)
  })
})
