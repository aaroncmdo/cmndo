// src/lib/offline/db.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { uploadToOp, gpsToOp } from './db'

describe('uploadToOp', () => {
  it('maps a legacy upload row to a Class-A op with blob + blob_meta', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const op = uploadToOp({
      id: 7, idempotency_key: 'k1', fall_id: 'f1', dokument_typ: 'schadensfoto',
      file_blob: blob, file_name: 'a.png', file_size: 1, content_type: 'image/png',
      ist_pflicht: true, ab_phase: null, created_at: 111, status: 'pending',
      retry_count: 2, last_attempt_at: 99, last_error: 'e',
    })
    expect(op.kind).toBe('fall_dokument_upload')
    expect(op.replay_class).toBe('A')
    expect(op.idempotency_key).toBe('k1')
    expect(op.blob).toBe(blob)
    expect(op.blob_meta).toEqual({ file_name: 'a.png', content_type: 'image/png', file_size: 1 })
    expect(op.payload).toEqual({ fall_id: 'f1', dokument_typ: 'schadensfoto', ist_pflicht: true, ab_phase: null })
    expect(op.entity_ref).toEqual({ scope: 'fall', id: 'f1' })
    expect(op.retry_count).toBe(2)
    expect(op.status).toBe('pending')
  })
})

describe('gpsToOp', () => {
  it('maps a legacy gps row to a Class-A op with sv payload', () => {
    const op = gpsToOp({
      id: 3, idempotency_key: 'g1', sv_id: 'sv1', termin_id: 't1', lat: 1, lng: 2,
      accuracy_m: 5, heading: null, speed_kmh: null, captured_at: 222,
      status: 'failed', retry_count: 1, last_attempt_at: 5, created_at: 222,
    })
    expect(op.kind).toBe('gps_position')
    expect(op.replay_class).toBe('A')
    expect(op.payload).toMatchObject({ sv_id: 'sv1', termin_id: 't1', lat: 1, lng: 2, captured_at: 222 })
    expect(op.blob).toBeUndefined()
  })
})

import Dexie from 'dexie'
import { offlineDB } from './db'

describe('v2 -> v3 migration', () => {
  it('moves upload + gps rows into mutation_outbox and clears legacy', async () => {
    // Seed a v2-shaped DB under the same name, then close it.
    const v2 = new Dexie('ClaimondoOffline')
    v2.version(1).stores({ upload_outbox: '++id, fall_id, status, created_at' })
    v2.version(2).stores({
      upload_outbox: '++id, fall_id, status, created_at, last_attempt_at, idempotency_key',
      gps_outbox: '++id, sv_id, status, captured_at, last_attempt_at, idempotency_key',
    })
    await v2.open()
    await v2.table('upload_outbox').add({
      idempotency_key: 'u1', fall_id: 'f1', dokument_typ: 'x', file_blob: new Blob(['a']),
      file_name: 'a.png', file_size: 1, content_type: 'image/png', ist_pflicht: false,
      ab_phase: null, created_at: 1, status: 'pending', retry_count: 0, last_attempt_at: null,
    })
    await v2.table('gps_outbox').add({
      idempotency_key: 'g1', sv_id: 's1', termin_id: null, lat: 1, lng: 2, accuracy_m: null,
      heading: null, speed_kmh: null, captured_at: 2, status: 'pending', retry_count: 0,
      last_attempt_at: null, created_at: 2,
    })
    v2.close()

    // Opening the real DB triggers the v3 upgrade.
    await offlineDB.open()
    const ops = await offlineDB.mutation_outbox.toArray()
    expect(ops.map((o) => o.kind).sort()).toEqual(['fall_dokument_upload', 'gps_position'])
    expect(await offlineDB.upload_outbox.count()).toBe(0)
    expect(await offlineDB.gps_outbox.count()).toBe(0)
  })
})
