// KFZ-180: Offline-Upload-Outbox mit Dexie IndexedDB.
// Files werden lokal gespeichert und bei Online-Verbindung hochgeladen.

import Dexie, { type Table } from 'dexie'

export interface OutboxItem {
  id?: number
  fall_id: string
  dokument_typ: string
  file_blob: Blob
  file_name: string
  file_size: number
  content_type: string
  ist_pflicht: boolean
  ab_phase: string | null
  created_at: number
  status: 'pending' | 'uploading' | 'failed'
  retry_count: number
  last_error?: string
}

class ClaimondoOfflineDB extends Dexie {
  upload_outbox!: Table<OutboxItem, number>

  constructor() {
    super('ClaimondoOffline')
    this.version(1).stores({
      upload_outbox: '++id, fall_id, status, created_at',
    })
  }
}

export const offlineDB = new ClaimondoOfflineDB()

let persistRequested = false

export async function addToOutbox(
  item: Omit<OutboxItem, 'id' | 'created_at' | 'status' | 'retry_count'>,
): Promise<number> {
  // Request persistent storage on first use
  if (!persistRequested && typeof navigator !== 'undefined' && navigator.storage?.persist) {
    persistRequested = true
    navigator.storage.persist().catch(() => {})
  }

  return offlineDB.upload_outbox.add({
    ...item,
    created_at: Date.now(),
    status: 'pending',
    retry_count: 0,
  })
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  return offlineDB.upload_outbox.orderBy('created_at').toArray()
}

export async function getPendingCount(): Promise<number> {
  return offlineDB.upload_outbox.where('status').anyOf('pending', 'uploading', 'failed').count()
}

export async function updateOutboxStatus(
  id: number,
  status: OutboxItem['status'],
  error?: string,
): Promise<void> {
  const item = await offlineDB.upload_outbox.get(id)
  await offlineDB.upload_outbox.update(id, {
    status,
    last_error: error,
    retry_count: status === 'failed' ? (item?.retry_count ?? 0) + 1 : item?.retry_count ?? 0,
  })
}

export async function removeFromOutbox(id: number): Promise<void> {
  await offlineDB.upload_outbox.delete(id)
}
