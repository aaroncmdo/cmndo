// src/app/admin/vertrieb/_lib/get-vertrieb-live-ops.ts
// Vertrieb-Cockpit: Live-Ops-Daten fuer die SV-Karte/-Liste im Cockpit. Spiegelt den Loader
// aus /admin/sachverstaendige (svs zuerst -> als preloadedSvs an getUnterwegsRouten, dann
// Promise.all), aber als Result-Object + Staff-Guard (admin/dispatch). Reine Wiederverwendung
// der @/lib/live-ops-Loader (service-role, identisch zur bestehenden Ops-Seite) -> keine
// Duplikation. Fail-soft: bei Ladefehler ok:false; der Caller faellt auf leere LiveOpsData
// zurueck, damit ein Mapbox-/Matrix-Fehler nie den ganzen Cockpit-Roster bricht.
import { requireRole } from '@/lib/auth/guards'
import {
  resolveLiveOpsScope,
  getLiveOpsSvs,
  getOffeneTermine,
  getUnterwegsRouten,
  getTagesrouten,
  getDeadPins,
  getLeads,
  type LiveOpsRole,
} from '@/lib/live-ops'
import type { LiveOpsData } from '@/components/live-ops/types'

export async function getVertriebLiveOps(): Promise<
  { ok: true; data: LiveOpsData; role: LiveOpsRole } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  // Cockpit laeuft unter /admin -> admin/dispatch. resolveLiveOpsScope liefert fuer beide 'all'
  // (kein zusaetzlicher DB-Call); der role-Wert steuert nur, welche Layer LiveOpsMap gated.
  const role: LiveOpsRole = guard.user.rolle === 'dispatch' ? 'dispatch' : 'admin'
  // Live-Ops-Daten haengen an externen Fetches (Supabase-Views + Mapbox-ETA). Damit ein
  // langsamer/flakiger Fetch (z.B. ECONNRESET unter Last) NICHT den ganzen Cockpit-Render
  // blockt, wird das Laden gegen eine Deadline gerennt -> bei Ueberschreitung leere Daten
  // (fail-soft wie bei Fehler). Prod-Schutz: der Roster rendert immer, Live-Ops degradiert.
  const DEADLINE_MS = 10_000
  const timedOut = Symbol('timeout')
  const load = (async (): Promise<LiveOpsData> => {
    const scope = await resolveLiveOpsScope(role, guard.user.id)
    const svs = await getLiveOpsSvs(scope)
    const [termine, routen, tagesrouten, deadPins, leads] = await Promise.all([
      getOffeneTermine(scope),
      getUnterwegsRouten(scope, svs),
      getTagesrouten(scope),
      getDeadPins(scope),
      getLeads(scope),
    ])
    return { svs, termine, routen, tagesrouten, deadPins, leads }
  })()
  load.catch(() => {}) // spaete Rejection nach Timeout nicht als unhandled hochblubbern lassen
  try {
    const result = await Promise.race([
      load,
      new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), DEADLINE_MS)),
    ])
    if (result === timedOut) {
      return { ok: false, error: 'Live-Ops-Timeout — Cockpit rendert ohne Live-Ops-Daten' }
    }
    return { ok: true, data: result, role }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Live-Ops-Ladefehler' }
  }
}
