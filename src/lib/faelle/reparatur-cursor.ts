// Reparatur-Cursor-Verdrahtung (Status-Achsen-Lane, 17.07.).
//
// Die Selbstzahler/Kasko-Reparatur-Achse (claims.abrechnungsweg IN
// ('selbstzahler','kasko')) fuehrt operative_status durch die Lane
//   reparatur-werkstatt-suche -> -angefragt -> -laeuft -> -erledigt -> abgeschlossen.
// Bisher wurde der Cursor NIE vorgerueckt: der Werkstatt-Reparatur-Abschluss schrieb
// operative_status='abgeschlossen' per Direkt-.update() an der State-Machine vorbei
// (repair-closure.ts / reparatur-abschluss-actions.ts). Prod-Beleg 17.07.: der einzige
// reparatur_termine-Claim stand auf 'ersterfassung' — der Cursor blieb komplett stehen.
//
// Dieser Helper rueckt den Cursor an den natuerlichen Flow-Punkten VORWAERTS durch die
// Engine (transitionFallStatus -> Timeline/Event/phase_transitions, ein Single-Writer-
// Funnel). Design-Invarianten:
//   - NON-FATAL: wirft nie in die Host-Action zurueck (try/catch). Cursor-Fortschritt
//     darf einen Werkstatt-/Kunde-Klick nicht brechen.
//   - FORWARD-only: steht der Cursor bereits >= Ziel (oder terminal), passiert nichts.
//   - GEGATET auf abrechnungsweg selbstzahler/kasko: ein Haftpflicht-Claim mit
//     Nebenreparatur wird NICHT in die Reparatur-Achse gehijackt.
//   - Schritt-fuer-Schritt validiert: jeder Hop muss in FALL_STATUS_TRANSITIONS stehen
//     (nutzt die vorhandene Matrix-Validierung von transitionFallStatus).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  FALL_STATUS_TRANSITIONS,
  transitionFallStatus,
  istGueltigerFallUebergang,
} from '@/lib/faelle/state-machine'
import { CLOSED_OPERATIVE_STATUS } from '@/lib/claims/terminal-status'

/** Die lineare Reparatur-Lane (Fortschritt aufsteigend). */
export const REPARATUR_LANE = [
  'reparatur-werkstatt-suche',
  'reparatur-angefragt',
  'reparatur-laeuft',
  'reparatur-erledigt',
] as const
export type ReparaturLaneStatus = (typeof REPARATUR_LANE)[number]

/** abrechnungsweg-Werte, deren HAUPT-Achse die Reparatur-Lane ist. */
const REDUCED_REPAIR_WEGE = new Set(['selbstzahler', 'kasko'])

/** operative_status-Werte, aus denen ein reduced-repair-Claim in die Lane einfaedelt. */
const REPARATUR_ENTRY = new Set(['ersterfassung', 'onboarding'])

/** Position eines Status in der Lane (-1 = nicht auf der Lane). */
export function laneIndex(status: string | null | undefined): number {
  if (!status) return -1
  return (REPARATUR_LANE as readonly string[]).indexOf(status)
}

/**
 * Darf der Cursor an der Lane teilnehmen? Nur reduced-repair-Claims, nur solange der
 * Cursor auf einem Entry- oder Lane-Status steht (nie einen SV-/Regulierungs-Achsen-
 * Claim oder einen terminalen Claim anfassen).
 */
export function darfReparaturAdvancen(abrechnungsweg: string | null | undefined, current: string): boolean {
  if (!REDUCED_REPAIR_WEGE.has(abrechnungsweg ?? '')) return false
  if (CLOSED_OPERATIVE_STATUS.has(current)) return false
  return REPARATUR_ENTRY.has(current) || laneIndex(current) >= 0
}

/**
 * Naechster gueltiger Vorwaerts-Hop von `current` Richtung `target`: bevorzugt direkt
 * zum Ziel (spart Hops/Events), sonst der am weitesten fortgeschrittene erlaubte
 * Lane-Status <= target. null = kein gueltiger Vorwaerts-Schritt.
 */
export function pickNextHop(current: string, target: ReparaturLaneStatus): string | null {
  const allowed = FALL_STATUS_TRANSITIONS[current] ?? []
  if (allowed.includes(target)) return target
  const tgtIdx = laneIndex(target)
  for (let i = tgtIdx; i >= 0; i--) {
    const cand = REPARATUR_LANE[i]
    if (allowed.includes(cand)) return cand
  }
  return null
}

/**
 * Rueckt den operative_status eines reduced-repair-Claims VORWAERTS bis (max.) `target`.
 * Jeder Hop laeuft durch transitionFallStatus (validiert + feuert Engine-Artefakte).
 * Non-fatal, forward-only (siehe Datei-Header).
 *
 * @param fallId  faelle_claim_bridge.fall_id (transitionFallStatus-Kontrakt).
 */
export async function advanceReparaturCursorTo(
  fallId: string,
  target: ReparaturLaneStatus,
  opts?: { user_id?: string | null; grund?: string },
): Promise<void> {
  try {
    const db = createAdminClient()
    // Max. Iterationen = Lane-Laenge (+1 Puffer). Verhindert Endlos-Loop falls ein Hop
    // den Status wider Erwarten nicht vorruecken sollte.
    let guard = 0
    while (guard++ <= REPARATUR_LANE.length) {
      const { data: bridge } = await db
        .from('faelle_claim_bridge')
        .select('claims:claims!fk_bridge_claim(operative_status, abrechnungsweg)')
        .eq('fall_id', fallId)
        .maybeSingle()
      const rel = (bridge as {
        claims?:
          | { operative_status?: string | null; abrechnungsweg?: string | null }
          | { operative_status?: string | null; abrechnungsweg?: string | null }[]
          | null
      } | null)?.claims
      const row = Array.isArray(rel) ? rel[0] : rel
      const current = row?.operative_status ?? null
      if (!current) return
      if (!darfReparaturAdvancen(row?.abrechnungsweg ?? null, current)) return
      const curIdx = laneIndex(current)
      const tgtIdx = laneIndex(target)
      if (curIdx >= 0 && curIdx >= tgtIdx) return // schon >= Ziel -> fertig
      const next = pickNextHop(current, target)
      if (!next) return // kein gueltiger Vorwaerts-Schritt -> aufhoeren (nicht brechen)
      await transitionFallStatus(fallId, next, {
        user_id: opts?.user_id ?? undefined,
        grund: opts?.grund,
      })
      if (next === target) return
    }
  } catch (err) {
    console.error('[reparatur-cursor] advanceReparaturCursorTo fehlgeschlagen (non-fatal):', err)
  }
}

/**
 * Faehrt einen reduced-repair-Claim sauber durch die Engine in den Abschluss:
 * Cursor -> reparatur-erledigt (Walk), dann -> abgeschlossen. Beide Schritte feuern
 * Timeline/Event/phase_transitions (loest den frueheren Direkt-.update()-Close +
 * #4500-Sichtbarkeits-Nachzug ab). Gibt {ok:false} zurueck, wenn der Claim nach dem
 * Walk NICHT auf einem gueltigen abgeschlossen-Quellstatus steht — statt zu werfen,
 * damit der Caller einen sauberen Fehler zurueckgeben kann.
 *
 * @param fallId  faelle_claim_bridge.fall_id.
 */
export async function closeReparaturClaimViaEngine(
  fallId: string,
  opts?: { user_id?: string | null; grund?: string },
): Promise<{ ok: boolean; error?: string }> {
  // 1) Cursor bis reparatur-erledigt heben (non-fatal, forward-only, gegated).
  await advanceReparaturCursorTo(fallId, 'reparatur-erledigt', opts)

  // 2) Von reparatur-erledigt (oder einem sonst gueltigen Quellstatus) auf abgeschlossen.
  try {
    const db = createAdminClient()
    const { data: bridge } = await db
      .from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim(operative_status)')
      .eq('fall_id', fallId)
      .maybeSingle()
    const rel = (bridge as {
      claims?: { operative_status?: string | null } | { operative_status?: string | null }[] | null
    } | null)?.claims
    const current = (Array.isArray(rel) ? rel[0] : rel)?.operative_status ?? null
    if (current === 'abgeschlossen') return { ok: true } // schon zu -> idempotent
    if (!current || !istGueltigerFallUebergang(current, 'abgeschlossen')) {
      return {
        ok: false,
        error: `Abschluss nicht moeglich: ${current ?? 'unbekannt'} -> abgeschlossen ist kein gueltiger Uebergang.`,
      }
    }
    await transitionFallStatus(fallId, 'abgeschlossen', {
      user_id: opts?.user_id ?? undefined,
      grund: opts?.grund,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Abschluss fehlgeschlagen.' }
  }
}

/**
 * Resolver claim_id -> fall_id (via faelle_claim_bridge). Die Cursor-Caller haben
 * meist nur die claim_id (reparatur_termine/claims sind claim-gekeyt), transitionFallStatus
 * braucht die fall_id. null wenn keine Bridge-Row (verifiziert 0 Faelle ohne Bridge).
 */
export async function fallIdForClaim(claimId: string): Promise<string | null> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('faelle_claim_bridge')
      .select('fall_id')
      .eq('claim_id', claimId)
      .maybeSingle()
    return (data as { fall_id?: string | null } | null)?.fall_id ?? null
  } catch {
    return null
  }
}
