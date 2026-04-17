// KFZ-180 + AAR-388: Offline-Outbox (Upload-Dokumente + GPS-Positionen).
// Dexie v2-Schema: upload_outbox um idempotency_key + last_attempt_at + 'dead'
// Status erweitert; neue gps_outbox-Tabelle für Field-Modus-Tracking.

import Dexie, { type Table } from 'dexie'

export type OutboxStatus = 'pending' | 'uploading' | 'failed' | 'dead'

export const MAX_RETRIES = 10

export interface OutboxItem {
  id?: number
  idempotency_key: string // AAR-388: UUID — Storage-Pfad + DB-UNIQUE
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
  last_attempt_at: number | null // AAR-388: für korrekten Backoff
  last_error?: string
}

export interface GpsOutboxItem {
  id?: number
  idempotency_key: string // UUID (für Batch-De-Dupe im Endpoint)
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number // Client-Messzeitpunkt (Epoch-ms)
  status: OutboxStatus
  retry_count: number
  last_attempt_at: number | null
  last_error?: string
  created_at: number
}

class ClaimondoOfflineDB extends Dexie {
  upload_outbox!: Table<OutboxItem, number>
  gps_outbox!: Table<GpsOutboxItem, number>

  constructor() {
    super('ClaimondoOffline')
    // v1 (KFZ-180) — nur upload_outbox ohne idempotency_key
    this.version(1).stores({
      upload_outbox: '++id, fall_id, status, created_at',
    })
    // v2 (AAR-388) — Idempotency-Key-Indices + gps_outbox
    this.version(2)
      .stores({
        upload_outbox:
          '++id, fall_id, status, created_at, last_attempt_at, idempotency_key',
        gps_outbox:
          '++id, sv_id, status, captured_at, last_attempt_at, idempotency_key',
      })
      .upgrade(async (tx) => {
        // Bestehende v1-Items bekommen einen Idempotency-Key + last_attempt_at=null
        await tx
          .table('upload_outbox')
          .toCollection()
          .modify((item: OutboxItem) => {
            if (!item.idempotency_key) item.idempotency_key = generateUuid()
            if (item.last_attempt_at === undefined) item.last_attempt_at = null
          })
      })
  }
}

export const offlineDB = new ClaimondoOfflineDB()

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (Legacy-Browser ohne crypto.randomUUID)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export { generateUuid }

let persistRequested = false

async function requestPersistIfPossible(): Promise<void> {
  if (persistRequested) return
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  persistRequested = true
  try {
    await navigator.storage.persist()
  } catch {
    // Kein Hard-Fail — Request ist best-effort
  }
}

// ---------- Upload-Outbox ----------

export async function addToOutbox(
  item: Omit<
    OutboxItem,
    | 'id'
    | 'created_at'
    | 'status'
    | 'retry_count'
    | 'idempotency_key'
    | 'last_attempt_at'
  >,
): Promise<{ id: number; idempotency_key: string }> {
  void requestPersistIfPossible()
  const idempotency_key = generateUuid()
  const id = await offlineDB.upload_outbox.add({
    ...item,
    idempotency_key,
    created_at: Date.now(),
    status: 'pending',
    retry_count: 0,
    last_attempt_at: null,
  })
  return { id, idempotency_key }
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  return offlineDB.upload_outbox.orderBy('created_at').toArray()
}

export async function getPendingCount(): Promise<number> {
  return offlineDB.upload_outbox
    .where('status')
    .anyOf('pending', 'uploading', 'failed')
    .count()
}

export async function getDeadCount(): Promise<number> {
  return offlineDB.upload_outbox.where('status').equals('dead').count()
}

export async function updateOutboxStatus(
  id: number,
  status: OutboxStatus,
  error?: string,
): Promise<void> {
  const item = await offlineDB.upload_outbox.get(id)
  const now = Date.now()
  const newRetryCount = status === 'failed' ? (item?.retry_count ?? 0) + 1 : item?.retry_count ?? 0
  const finalStatus: OutboxStatus =
    status === 'failed' && newRetryCount >= MAX_RETRIES ? 'dead' : status

  await offlineDB.upload_outbox.update(id, {
    status: finalStatus,
    last_error: error,
    retry_count: newRetryCount,
    last_attempt_at: status === 'uploading' || status === 'failed' ? now : item?.last_attempt_at ?? null,
  })
}

export async function removeFromOutbox(id: number): Promise<void> {
  await offlineDB.upload_outbox.delete(id)
}

export async function resetDeadLetter(id: number): Promise<void> {
  await offlineDB.upload_outbox.update(id, {
    status: 'pending',
    retry_count: 0,
    last_error: undefined,
    last_attempt_at: null,
  })
}

// ---------- GPS-Outbox ----------

export async function addGpsPosition(
  item: Omit<
    GpsOutboxItem,
    | 'id'
    | 'created_at'
    | 'status'
    | 'retry_count'
    | 'idempotency_key'
    | 'last_attempt_at'
  >,
): Promise<number> {
  void requestPersistIfPossible()
  return offlineDB.gps_outbox.add({
    ...item,
    idempotency_key: generateUuid(),
    created_at: Date.now(),
    status: 'pending',
    retry_count: 0,
    last_attempt_at: null,
  })
}

export async function getGpsPendingCount(): Promise<number> {
  return offlineDB.gps_outbox
    .where('status')
    .anyOf('pending', 'uploading', 'failed')
    .count()
}

export async function updateGpsStatus(
  ids: number[],
  status: OutboxStatus,
  error?: string,
): Promise<void> {
  const now = Date.now()
  await offlineDB.gps_outbox
    .where('id')
    .anyOf(ids)
    .modify((item) => {
      const nextRetry = status === 'failed' ? item.retry_count + 1 : item.retry_count
      item.retry_count = nextRetry
      item.last_error = error
      item.last_attempt_at = now
      item.status =
        status === 'failed' && nextRetry >= MAX_RETRIES ? 'dead' : status
    })
}

export async function removeGpsItems(ids: number[]): Promise<void> {
  await offlineDB.gps_outbox.where('id').anyOf(ids).delete()
}

// ---------- Recovery ----------

/**
 * AAR-388: Beim App-Start Items die während eines Uploads hängen geblieben
 * sind (Tab-Reload, Browser-Crash) zurück auf 'pending' setzen.
 */
export async function recoverOutbox(): Promise<{ upload: number; gps: number }> {
  const upload = await offlineDB.upload_outbox
    .where('status')
    .equals('uploading')
    .modify({ status: 'pending' })

  const gps = await offlineDB.gps_outbox
    .where('status')
    .equals('uploading')
    .modify({ status: 'pending' })

  return { upload, gps }
}
