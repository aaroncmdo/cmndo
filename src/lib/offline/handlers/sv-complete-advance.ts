'use client'
import { completeAndAdvance } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface CompleteAdvancePayload { sessionId: string; terminId: string }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as CompleteAdvancePayload
  // Pass terminId as expectedAktuellerTerminId -> CAS: a double replay whose
  // session already advanced past this termin is a no-op (skipped=true, still success).
  const res = await completeAndAdvance(p.sessionId, p.terminId, p.terminId)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Abschluss-Sync fehlgeschlagen' }
}

export const svCompleteAdvanceHandler: OfflineHandler = { kind: 'sv_complete_advance', replay }
registerHandler(svCompleteAdvanceHandler)
