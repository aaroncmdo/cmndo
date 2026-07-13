// src/lib/offline/db.ts
// Dexie schema. v1/v2 kept verbatim for migration; v3 introduces the
// generalized mutation_outbox + snapshots and migrates existing rows.
import Dexie, { type Table } from 'dexie'
import type { OutboxOp, OutboxStatus } from './ops'

export interface Snapshot {
  key: string
  scope: string
  role: string
  data: unknown
  saved_at: number
  last_read_at: number
}

export interface LegacyUploadItem {
  id?: number
  idempotency_key: string
  fall_id: string
  dokument_typ: string
  file_blob: Blob
  file_name: string
  file_size: number
  content_type: string
  ist_pflicht: boolean
  ab_phase: string | null
  created_at: number
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
}

export interface LegacyGpsItem {
  id?: number
  idempotency_key: string
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

export function uploadToOp(u: LegacyUploadItem): OutboxOp {
  return {
    kind: 'fall_dokument_upload',
    idempotency_key: u.idempotency_key,
    replay_class: 'A',
    payload: {
      fall_id: u.fall_id,
      dokument_typ: u.dokument_typ,
      ist_pflicht: u.ist_pflicht,
      ab_phase: u.ab_phase,
    },
    blob: u.file_blob,
    blob_meta: { file_name: u.file_name, content_type: u.content_type, file_size: u.file_size },
    entity_ref: { scope: 'fall', id: u.fall_id },
    status: u.status,
    retry_count: u.retry_count,
    last_attempt_at: u.last_attempt_at,
    last_error: u.last_error,
    created_at: u.created_at,
  }
}

export function gpsToOp(g: LegacyGpsItem): OutboxOp {
  return {
    kind: 'gps_position',
    idempotency_key: g.idempotency_key,
    replay_class: 'A',
    payload: {
      sv_id: g.sv_id,
      termin_id: g.termin_id,
      lat: g.lat,
      lng: g.lng,
      accuracy_m: g.accuracy_m,
      heading: g.heading,
      speed_kmh: g.speed_kmh,
      captured_at: g.captured_at,
    },
    status: g.status,
    retry_count: g.retry_count,
    last_attempt_at: g.last_attempt_at,
    last_error: g.last_error,
    created_at: g.created_at,
  }
}

class ClaimondoOfflineDB extends Dexie {
  upload_outbox!: Table<LegacyUploadItem, number>
  gps_outbox!: Table<LegacyGpsItem, number>
  mutation_outbox!: Table<OutboxOp, number>
  snapshots!: Table<Snapshot, string>

  constructor() {
    super('ClaimondoOffline')

    // v1 (KFZ-180)
    this.version(1).stores({ upload_outbox: '++id, fall_id, status, created_at' })

    // v2 (AAR-388)
    this.version(2)
      .stores({
        upload_outbox: '++id, fall_id, status, created_at, last_attempt_at, idempotency_key',
        gps_outbox: '++id, sv_id, status, captured_at, last_attempt_at, idempotency_key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('upload_outbox')
          .toCollection()
          .modify((item: LegacyUploadItem) => {
            if (!item.idempotency_key) item.idempotency_key = crypto.randomUUID()
            if (item.last_attempt_at === undefined) item.last_attempt_at = null
          })
      })

    // v3 (offline-first foundation) — generalized outbox + snapshots
    this.version(3)
      .stores({
        mutation_outbox: '++id, kind, status, created_at, last_attempt_at, idempotency_key',
        snapshots: 'key, scope, last_read_at',
      })
      .upgrade(async (tx) => {
        const uploads = (await tx.table('upload_outbox').toArray()) as LegacyUploadItem[]
        for (const u of uploads) await tx.table('mutation_outbox').add(uploadToOp(u))
        const gps = (await tx.table('gps_outbox').toArray()) as LegacyGpsItem[]
        for (const g of gps) await tx.table('mutation_outbox').add(gpsToOp(g))
        // Rows copied — clear legacy rows to avoid double blob storage.
        // The (now-empty) legacy tables stay defined for rollback-safety.
        await tx.table('upload_outbox').clear()
        await tx.table('gps_outbox').clear()
      })
  }
}

export const offlineDB = new ClaimondoOfflineDB()
