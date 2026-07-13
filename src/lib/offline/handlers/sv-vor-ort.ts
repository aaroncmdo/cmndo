'use client'
import { markSvVorOrt } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface VorOrtPayload { terminId: string; lat: number; lng: number; via: 'geofence' | 'manuell' }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as VorOrtPayload
  const res = await markSvVorOrt(p.terminId, p.lat, p.lng, p.via)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Ankunft-Sync fehlgeschlagen' }
}

function optimisticPatch(current: unknown, op: OutboxOp): unknown {
  const p = op.payload as VorOrtPayload
  const cur = current as { stops?: Array<{ termin_id: string; sv_angekommen_am: string | null }> } | null
  if (!cur?.stops) return current
  const now = new Date().toISOString()
  return {
    ...cur,
    stops: cur.stops.map((s) => (s.termin_id === p.terminId && !s.sv_angekommen_am ? { ...s, sv_angekommen_am: now } : s)),
  }
}

export const svVorOrtHandler: OfflineHandler = { kind: 'sv_vor_ort', replay, optimisticPatch }
registerHandler(svVorOrtHandler)
