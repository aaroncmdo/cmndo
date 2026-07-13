// src/lib/offline/outbox.compat.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { offlineDB } from './db'
import { addToOutbox, getPendingCount, getOutboxItems } from './outbox'

beforeEach(async () => {
  await offlineDB.open()
  await offlineDB.mutation_outbox.clear()
})

describe('addToOutbox compat', () => {
  it('enqueues a fall_dokument_upload op and surfaces it via legacy shape', async () => {
    const { id, idempotency_key } = await addToOutbox({
      fall_id: 'f1', dokument_typ: 'schadensfoto', file_blob: new Blob(['x'], { type: 'image/png' }),
      file_name: 'a.png', file_size: 3, content_type: 'image/png', ist_pflicht: true, ab_phase: null,
    })
    expect(id).toBeGreaterThan(0)
    expect(idempotency_key).toMatch(/[0-9a-f-]{36}/)
    const row = await offlineDB.mutation_outbox.get(id)
    expect(row?.kind).toBe('fall_dokument_upload')
    expect(await getPendingCount()).toBe(1)
    const items = await getOutboxItems()
    expect(items[0]).toMatchObject({ file_name: 'a.png', dokument_typ: 'schadensfoto', fall_id: 'f1', status: 'pending' })
  })
})
