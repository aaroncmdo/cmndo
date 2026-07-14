'use client'
import {
  uploadZb1Flow,
  uploadPolizeiberichtFlow,
  uploadZeugenaussageFlow,
} from '@/app/flow/[token]/self-service-actions'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface DocUploadPayload {
  token: string
  base64: string
  contentType: string
}

// Alle 3 Flow-Uploads setzen LWW-Lead-Felder (`<typ>_url/_status/_hochgeladen_am`)
// auf einem Date.now()-Pfad = Class B (idempotenter Feld-Set). Netzwerk-Wurf -> retry
// (Backoff); server {ok:false} (Token abgelaufen/ungültig = nicht-transient) -> conflict
// (droppen, kein Endlos-Retry). Doppel-Replay = benigne Duplikat-Storage-Datei
// (Date.now-Pfad), Lead-Feld bleibt LWW-konsistent.
async function replayVia(
  action: (token: string, base64: string, contentType: string) => Promise<{ ok: boolean; error?: string }>,
  op: OutboxOp,
  label: string,
): Promise<ReplayResult> {
  const p = op.payload as DocUploadPayload
  try {
    const res = await action(p.token, p.base64, p.contentType)
    return res.ok ? { outcome: 'done' } : { outcome: 'conflict', error: res.error ?? `${label}-Sync verworfen` }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

// uploadZb1Flow gibt zusätzlich `extracted?` zurück — der Replay ignoriert es bewusst
// (die Live-Prefill-UX ist offline nicht rekonstruierbar; der Server füllt via H6 die
// leeren Lead-Felder). Return ist strukturell {ok,error?}-kompatibel.
export const flowZb1UploadHandler: OfflineHandler = {
  kind: 'flow_zb1_upload',
  replay: (op) => replayVia(uploadZb1Flow, op, 'ZB1'),
}
export const flowPolizeiberichtUploadHandler: OfflineHandler = {
  kind: 'flow_polizeibericht_upload',
  replay: (op) => replayVia(uploadPolizeiberichtFlow, op, 'Polizeibericht'),
}
export const flowZeugenaussageUploadHandler: OfflineHandler = {
  kind: 'flow_zeugenaussage_upload',
  replay: (op) => replayVia(uploadZeugenaussageFlow, op, 'Zeugenaussage'),
}
registerHandler(flowZb1UploadHandler)
registerHandler(flowPolizeiberichtUploadHandler)
registerHandler(flowZeugenaussageUploadHandler)
