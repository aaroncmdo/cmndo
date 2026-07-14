'use client'
import { saveFeldmodusNotizen } from '@/app/gutachter/feldmodus/_fallakte/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface NotizenPayload { fallId: string; notizen: string }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as NotizenPayload
  const res = await saveFeldmodusNotizen(p.fallId, p.notizen)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Notizen-Sync fehlgeschlagen' }
}

function optimisticPatch(current: unknown, op: OutboxOp): unknown {
  const p = op.payload as NotizenPayload
  const cur = current as { fall?: { sv_notizen_vor_ort?: string | null } } | null
  if (!cur?.fall) return current
  return { ...cur, fall: { ...cur.fall, sv_notizen_vor_ort: p.notizen } }
}

export const svNotizenHandler: OfflineHandler = { kind: 'sv_notizen_vor_ort', replay, optimisticPatch }
registerHandler(svNotizenHandler)
