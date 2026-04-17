// AAR-388: GPS-Outbox Sync.
// Batch-Upload (bis zu 50 Positionen pro Call) an /api/sv/position-batch.
// Client setzt IMMER in die Outbox — der Sync entscheidet online/offline.
// Merge-Regel im Endpoint: newest captured_at wins pro gutachter.

'use client'

import {
  offlineDB,
  updateGpsStatus,
  removeGpsItems,
  getGpsPendingCount,
  type GpsOutboxItem,
} from './outbox'
import { getBackoff } from './sync-outbox'

const BATCH_SIZE = 50

let syncingGps = false

type BatchPayload = {
  positions: Array<{
    idempotency_key: string
    termin_id: string | null
    lat: number
    lng: number
    accuracy_m: number | null
    heading: number | null
    speed_kmh: number | null
    captured_at: string // ISO
  }>
}

export async function syncGpsOutbox(): Promise<{
  synced: number
  failed: number
}> {
  if (syncingGps) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 }
  }

  syncingGps = true
  let synced = 0
  let failed = 0

  try {
    const items = (await offlineDB.gps_outbox
      .where('status')
      .anyOf('pending', 'failed')
      .sortBy('captured_at')) as GpsOutboxItem[]

    // Backoff-Filter für failed-Items
    const ready = items.filter((item) => {
      if (item.status !== 'failed') return true
      if (item.retry_count === 0) return true
      const since =
        item.last_attempt_at != null
          ? Date.now() - item.last_attempt_at
          : Infinity
      return since >= getBackoff(item.retry_count)
    })

    for (let i = 0; i < ready.length; i += BATCH_SIZE) {
      const batch = ready.slice(i, i + BATCH_SIZE)
      const ids = batch.map((b) => b.id).filter((n): n is number => n != null)

      const payload: BatchPayload = {
        positions: batch.map((b) => ({
          idempotency_key: b.idempotency_key,
          termin_id: b.termin_id,
          lat: b.lat,
          lng: b.lng,
          accuracy_m: b.accuracy_m,
          heading: b.heading,
          speed_kmh: b.speed_kmh,
          captured_at: new Date(b.captured_at).toISOString(),
        })),
      }

      await updateGpsStatus(ids, 'uploading')

      try {
        const res = await fetch('/api/sv/position-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => 'Batch-Upload fehlgeschlagen')
          await updateGpsStatus(ids, 'failed', text.slice(0, 500))
          failed += batch.length
          continue
        }

        await removeGpsItems(ids)
        synced += batch.length
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Netzwerk-Fehler'
        await updateGpsStatus(ids, 'failed', msg)
        failed += batch.length
      }
    }
  } finally {
    syncingGps = false
  }

  return { synced, failed }
}

let gpsListenerRegistered = false

export function registerGpsOnlineSync(): void {
  if (gpsListenerRegistered || typeof window === 'undefined') return
  gpsListenerRegistered = true

  window.addEventListener('online', () => {
    setTimeout(() => syncGpsOutbox(), 1500)
  })
  if (navigator.onLine) {
    setTimeout(() => syncGpsOutbox(), 3000)
  }
}

export { getGpsPendingCount }
