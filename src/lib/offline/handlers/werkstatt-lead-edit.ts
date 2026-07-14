'use client'
import { registerHandler } from '../registry'
import type { OfflineHandler, OutboxOp, ReplayResult } from '../ops'

interface WerkstattLeadEditPayload {
  leadId: string
  patch: Record<string, string | null>
}

// Whitelisted LWW-Feld-Set auf dem Werkstatt-Lead (Class B) — Replay 2× = gleiches Update =
// idempotent. Auth/Ownership (requirePortalAccess + v_werkstatt_lead) greift beim Replay
// (Werkstatt weiter eingeloggt, eigener Lead). Netzwerk-Wurf -> retry (Backoff); server
// {ok:false} (Lead konvertiert / kein Zugriff / ausgeloggt = nicht-transient) -> conflict.
//
// LAZY import der Server-Action: ihr Import-Graph zieht transitiv `server-only`
// (portal-guard / start-link). Ein statischer Top-Level-Import wuerde den Handler-Barrel
// (`handlers/index.ts`, via `sync.ts` side-effect-importiert) in Client-/Test-Kontexten
// brechen. Erst beim Replay (Browser, Drain-Zeit — dort ist die Action ein Client-RPC-Stub)
// geladen. vi.mock faengt den dynamischen Import in Tests ab.
async function replay(op: OutboxOp): Promise<ReplayResult> {
  const p = op.payload as WerkstattLeadEditPayload
  try {
    const { bearbeiteWerkstattLead } = await import('@/app/werkstatt/(shell)/anfragen/actions')
    const res = await bearbeiteWerkstattLead(p.leadId, p.patch)
    return res.ok
      ? { outcome: 'done' }
      : { outcome: 'conflict', error: res.error ?? 'Werkstatt-Anfrage-Sync verworfen' }
  } catch (e) {
    return { outcome: 'retry', error: e instanceof Error ? e.message : 'Netzwerk-Fehler' }
  }
}

export const werkstattLeadEditHandler: OfflineHandler = { kind: 'werkstatt_lead_edit', replay }
registerHandler(werkstattLeadEditHandler)
