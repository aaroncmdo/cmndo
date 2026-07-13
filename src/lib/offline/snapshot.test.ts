// src/lib/offline/snapshot.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { resolveOfflineData, saveSnapshot, readSnapshot, evictLRU } from './snapshot'

describe('resolveOfflineData (pure)', () => {
  it('prefers live server data', () => {
    expect(resolveOfflineData({ serverData: { a: 1 }, snapshot: null }))
      .toEqual({ data: { a: 1 }, source: 'live', staleSince: null })
  })
  it('falls back to snapshot', () => {
    const snap = { key: 'k', scope: 's', role: 'sv', data: { a: 2 }, saved_at: 50, last_read_at: 60 }
    expect(resolveOfflineData({ snapshot: snap }))
      .toEqual({ data: { a: 2 }, source: 'snapshot', staleSince: 50 })
  })
  it('empty when nothing available', () => {
    expect(resolveOfflineData({ snapshot: null }))
      .toEqual({ data: null, source: 'empty', staleSince: null })
  })
})

describe('snapshot store', () => {
  it('round-trips a snapshot', async () => {
    await saveSnapshot({ key: 'fall:1', scope: 'fall', role: 'sv', data: { x: 1 } })
    const snap = await readSnapshot('fall:1')
    expect(snap?.data).toEqual({ x: 1 })
  })
  it('evictLRU keeps only the cap newest by last_read_at', async () => {
    for (const [k, t] of [['a', 1], ['b', 2], ['c', 3]] as const) {
      await saveSnapshot({ key: `s:${k}`, scope: 's', role: 'sv', data: k, nowOverride: t })
    }
    const removed = await evictLRU(2, 's')
    expect(removed).toBe(1)
    expect(await readSnapshot('s:a')).toBeNull() // oldest gone
    expect(await readSnapshot('s:c')).not.toBeNull()
  })
})
