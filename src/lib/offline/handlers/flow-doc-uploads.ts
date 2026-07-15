'use client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface DocUploadPayload {
  token: string
  base64: string
  contentType: string
}

type FlowDocAction = (token: string, base64: string, contentType: string) => Promise<{ ok: boolean; error?: string }>
type FlowDocActionsModule = typeof import('@/app/flow/[token]/self-service-actions')

// Alle 3 Flow-Uploads setzen LWW-Lead-Felder (`<typ>_url/_status/_hochgeladen_am`)
// auf einem Date.now()-Pfad = Class B (idempotenter Feld-Set). Netzwerk-Wurf -> retry
// (Backoff); server {ok:false} (Token abgelaufen/ungültig = nicht-transient) -> conflict
// (droppen, kein Endlos-Retry). Doppel-Replay = benigne Duplikat-Storage-Datei
// (Date.now-Pfad), Lead-Feld bleibt LWW-konsistent.
//
// LAZY import der Server-Actions: ihr Import-Graph zieht transitiv `server-only` (die
// Signier-/Storage-Kette der self-service-actions). Ein statischer Top-Level-Import
// wuerde den Handler-Barrel (`handlers/index.ts`, via `sync.ts` side-effect-importiert)
// in Client-/Test-Kontexten brechen. Erst beim Replay (Browser, Drain-Zeit — dort ist
// die Action ein Client-RPC-Stub) geladen. vi.mock faengt den dynamischen Import in
// Tests ab. Gleiches Muster wie werkstatt-lead-edit.
async function replayVia(
  pick: (m: FlowDocActionsModule) => FlowDocAction,
  op: OutboxOp,
  label: string,
): Promise<ReplayResult> {
  const p = op.payload as DocUploadPayload
  try {
    const m = await import('@/app/flow/[token]/self-service-actions')
    const res = await pick(m)(p.token, p.base64, p.contentType)
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
  replay: (op) => replayVia((m) => m.uploadZb1Flow, op, 'ZB1'),
}
export const flowPolizeiberichtUploadHandler: OfflineHandler = {
  kind: 'flow_polizeibericht_upload',
  replay: (op) => replayVia((m) => m.uploadPolizeiberichtFlow, op, 'Polizeibericht'),
}
export const flowZeugenaussageUploadHandler: OfflineHandler = {
  kind: 'flow_zeugenaussage_upload',
  replay: (op) => replayVia((m) => m.uploadZeugenaussageFlow, op, 'Zeugenaussage'),
}
registerHandler(flowZb1UploadHandler)
registerHandler(flowPolizeiberichtUploadHandler)
registerHandler(flowZeugenaussageUploadHandler)
