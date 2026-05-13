// 13.05.2026: Defense-in-Depth-Guard für Public-Flow-Lead-Mutations.
//
// Kontext: `lib/actions/update-lead-gegner.ts` + `update-lead-zb1-manual.ts`
// werden aus dem anonymen Schaden-Melden-Flow aufgerufen (kein Auth-User).
// Sie sind durch UUID-Keyspace (10^36) + sessionStorage-leadId implizit
// geschützt, aber haben formal keinen Auth-Check. Server-Actions-Audit
// (docs/12.05.2026/server-actions-pattern-audit.md) hat sie als 🔴 markiert.
//
// State-Guard: Lead darf nur mutiert werden, wenn `qualifizierungs_phase` NICHT
// in einer „finalen" Phase liegt (konvertiert/sa-unterschrieben/etc.). Verhindert,
// dass jemand mit einer alten UUID einen längst abgeschlossenen Fall ändert.
//
// Sentry-Warn bei Block: erlaubt Visibility auf potenzielle Angriffsversuche
// ohne den legitimen Flow zu brechen.

import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'

// Phasen ab denen ein Lead nicht mehr durch den Public-Flow geändert werden darf.
// Quelle: leads_qualifizierungs_phase_check Constraint + Funnel-Status-Logik.
const BLOCKED_PHASES = new Set([
  'konvertiert',
  'sa-ausstehend',
  'sa-unterschrieben',
  'abgeschlossen',
  'disqualifiziert',
  'kalt',
])

export type LeadMutableResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Prüft, ob ein Lead durch eine anon-Action mutiert werden darf.
 *
 * Aufruf VOR dem `.from('leads').update(...)`:
 *
 * ```ts
 * const guard = await assertLeadMutable(supabase, leadId, 'updateLeadGegner')
 * if (!guard.ok) return { success: false, error: guard.error }
 * ```
 */
export async function assertLeadMutable(
  supabase: SupabaseClient,
  leadId: string,
  actionName: string,
): Promise<LeadMutableResult> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, qualifizierungs_phase')
    .eq('id', leadId)
    .maybeSingle()

  if (error) {
    Sentry.captureMessage('assertLeadMutable: DB-Fehler beim Lead-Lookup', {
      level: 'error',
      tags: { action: actionName },
      extra: { leadId, dbError: error.message },
    })
    return { ok: false, error: 'Lead konnte nicht geprüft werden' }
  }

  if (!data) {
    Sentry.captureMessage('assertLeadMutable: Lead nicht gefunden', {
      level: 'warning',
      tags: { action: actionName },
      extra: { leadId },
    })
    return { ok: false, error: 'Lead nicht gefunden' }
  }

  const phase = (data as { qualifizierungs_phase?: string | null }).qualifizierungs_phase
  if (phase && BLOCKED_PHASES.has(phase)) {
    Sentry.captureMessage(
      'assertLeadMutable: Mutation auf gesperrte Lead-Phase versucht',
      {
        level: 'warning',
        tags: { action: actionName, blockedPhase: phase },
        extra: { leadId, phase },
      },
    )
    return {
      ok: false,
      error: 'Dieser Vorgang ist bereits abgeschlossen und kann nicht mehr geändert werden.',
    }
  }

  return { ok: true }
}
