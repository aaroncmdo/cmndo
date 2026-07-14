'use client'
import { markBesichtigungGestartet } from '@/app/gutachter/feldmodus/actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface BesPayload { terminId: string; sessionId: string; via: 'beide_angekommen' | 'termin_uhrzeit' | 'manuell' }

async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as BesPayload
  const res = await markBesichtigungGestartet(p.sessionId, p.terminId, p.via)
  return res.success ? { outcome: 'done' } : { outcome: 'retry', error: res.error ?? 'Besichtigungsstart-Sync fehlgeschlagen' }
}

export const besichtigungGestartetHandler: OfflineHandler = { kind: 'besichtigung_gestartet', replay }
registerHandler(besichtigungGestartetHandler)
