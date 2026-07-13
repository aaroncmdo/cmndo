// src/lib/offline/handlers/gps-position.ts
'use client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp } from '../ops'

const BATCH_SIZE = 50

interface GpsPayload {
  sv_id: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: number
}

async function drainBatch(ops: OutboxOp[]): Promise<{ done: number[]; failed: number[]; error?: string }> {
  const sorted = [...ops].sort((a, b) => {
    const ca = (a.payload as GpsPayload).captured_at
    const cb = (b.payload as GpsPayload).captured_at
    return ca - cb
  })
  const done: number[] = []
  const failed: number[] = []
  let error: string | undefined

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const chunk = sorted.slice(i, i + BATCH_SIZE)
    const ids = chunk.map((o) => o.id!).filter(Boolean)
    const payload = {
      positions: chunk.map((o) => {
        const p = o.payload as GpsPayload
        return {
          idempotency_key: o.idempotency_key,
          termin_id: p.termin_id,
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracy_m,
          heading: p.heading,
          speed_kmh: p.speed_kmh,
          captured_at: new Date(p.captured_at).toISOString(),
        }
      }),
    }
    try {
      const res = await fetch('/api/sv/position-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error = (await res.text().catch(() => 'Batch-Upload fehlgeschlagen')).slice(0, 500)
        failed.push(...ids)
        continue
      }
      done.push(...ids)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Netzwerk-Fehler'
      failed.push(...ids)
    }
  }
  return { done, failed, error }
}

export const gpsPositionHandler: OfflineHandler = { kind: 'gps_position', drainBatch }
registerHandler(gpsPositionHandler)
