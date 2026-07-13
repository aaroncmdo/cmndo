// src/lib/offline/outbox.ts
// Back-compat shim. The real storage is now db.ts (mutation_outbox); this file
// maps the legacy KFZ-180/AAR-388 API onto the generalized layer so existing
// consumers (FallDokumentDropzone, useFieldTracking, OutboxBadge) keep working.
'use client'
import { offlineDB } from './db'
import { enqueueOp, getPendingCountByKind, markOp, removeOp, resetDeadLetter as resetDeadLetterNew, recoverOutbox as recoverOutboxNew } from './enqueue'
import type { OutboxStatus } from './ops'
export { offlineDB } from './db'
export { generateUuid, MAX_RETRIES, type OutboxStatus } from './ops'

// Legacy shapes kept for consumers that render them (OutboxBadge/DeadLetterDialog).
export interface OutboxItem {
  id?: number
  idempotency_key: string
  fall_id: string
  dokument_typ: string
  file_name: string
  file_size: number
  content_type: string
  status: OutboxStatus
  retry_count: number
  last_error?: string
}
export interface GpsOutboxItem {
  id?: number
  idempotency_key: string
  sv_id: string
  status: OutboxStatus
}

export async function addToOutbox(item: {
  fall_id: string
  dokument_typ: string
  file_blob: Blob
  file_name: string
  file_size: number
  content_type: string
  ist_pflicht: boolean
  ab_phase: string | null
}): Promise<{ id: number; idempotency_key: string }> {
  return enqueueOp({
    kind: 'fall_dokument_upload',
    replay_class: 'A',
    payload: { fall_id: item.fall_id, dokument_typ: item.dokument_typ, ist_pflicht: item.ist_pflicht, ab_phase: item.ab_phase },
    blob: item.file_blob,
    blob_meta: { file_name: item.file_name, content_type: item.content_type, file_size: item.file_size },
    entity_ref: { scope: 'fall', id: item.fall_id },
  })
}

export async function addGpsPosition(item: {
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
}): Promise<number> {
  const { id } = await enqueueOp({ kind: 'gps_position', replay_class: 'A', payload: { ...item } })
  return id
}

export async function getPendingCount(): Promise<number> {
  return getPendingCountByKind(['fall_dokument_upload'])
}
export async function getGpsPendingCount(): Promise<number> {
  return getPendingCountByKind(['gps_position'])
}
// Back-compat: counts ONLY fall_dokument_upload dead ops. This matches the legacy
// upload_outbox-only dead count AND DeadLetterDialog (which renders upload ops via
// getOutboxItems), so the badge and the dialog stay in sync. It intentionally diverges
// from the generalized enqueue.getDeadCount() (which counts ALL kinds). When a future
// slice surfaces GPS/other dead ops in the badge, switch usePendingCount to
// enqueue.getDeadCount() and extend getOutboxItems/DeadLetterDialog accordingly.
export async function getDeadCount(): Promise<number> {
  return offlineDB.mutation_outbox
    .where('kind')
    .equals('fall_dokument_upload')
    .filter((op) => op.status === 'dead')
    .count()
}

/** Map mutation_outbox upload ops back to the legacy OutboxItem shape for UI. */
export async function getOutboxItems(): Promise<OutboxItem[]> {
  const rows = await offlineDB.mutation_outbox.where('kind').equals('fall_dokument_upload').sortBy('created_at')
  return rows.map((op) => {
    const p = op.payload as { fall_id: string; dokument_typ: string }
    return {
      id: op.id,
      idempotency_key: op.idempotency_key,
      fall_id: p.fall_id,
      dokument_typ: p.dokument_typ,
      file_name: op.blob_meta?.file_name ?? '',
      file_size: op.blob_meta?.file_size ?? 0,
      content_type: op.blob_meta?.content_type ?? '',
      status: op.status,
      retry_count: op.retry_count,
      last_error: op.last_error,
    }
  })
}

export async function updateOutboxStatus(id: number, status: OutboxStatus, error?: string): Promise<void> {
  await markOp(id, status, error)
}
export async function removeFromOutbox(id: number): Promise<void> {
  await removeOp(id)
}
export async function resetDeadLetter(id: number): Promise<void> {
  await resetDeadLetterNew(id)
}
export async function recoverOutbox(): Promise<{ upload: number; gps: number }> {
  const n = await recoverOutboxNew()
  return { upload: n, gps: 0 } // combined recovery; split kept for signature compat
}
