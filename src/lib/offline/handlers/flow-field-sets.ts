'use client'
import { updateLeadStammdaten } from '@/app/flow/[token]/actions'
import { speichereFeststellungFlow } from '@/app/flow/[token]/self-service-feststellung-actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface StammdatenPayload {
  leadId: string
  data: { vorname?: string; nachname?: string; telefon?: string; email?: string }
  token: string
}
interface FeststellungPayload { token: string; values: Record<string, unknown> }

// Klassifikation (grounding E.2): Netzwerk-Wurf -> retry (Backoff); server {success/ok:false}
// (Token abgelaufen / nicht autorisiert = nicht-transient bei LWW-Field-Writes) -> conflict
// (droppen, kein endloses Retry).
async function replayStammdaten(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as StammdatenPayload
  try {
    const res = await updateLeadStammdaten(p.leadId, p.data, p.token)
    return res.success
      ? { outcome: 'done' }
      : { outcome: 'conflict', error: res.error ?? 'Stammdaten-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

async function replayFeststellung(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as FeststellungPayload
  try {
    const res = await speichereFeststellungFlow(p.token, p.values)
    return res.ok
      ? { outcome: 'done' }
      : { outcome: 'conflict', error: res.error ?? 'Feststellung-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

export const flowStammdatenHandler: OfflineHandler = { kind: 'flow_stammdaten', replay: replayStammdaten }
export const flowFeststellungHandler: OfflineHandler = { kind: 'flow_feststellung', replay: replayFeststellung }
registerHandler(flowStammdatenHandler)
registerHandler(flowFeststellungHandler)
