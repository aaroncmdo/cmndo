import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// failed_async_operations ist eine neue Tabelle; database.types.ts ist noch NICHT regen't
// (vermeidet einen grossen, mit Parallel-Sessions kollidierenden Type-Regen am Types-File).
// Bis ein Capstone-Regen nachzieht: lokal ungetypter Zugriff via SupabaseClient-Cast.
function deadLetterDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// Reliability-Sweep: zentrales Dead-Letter fuer kritische async-Operationen.
// Handler (Webhooks/Crons/externe Pushes) rufen recordFailedOperation() im catch;
// der recovery-monitor-Cron eskaliert nicht-aufgeloeste Eintraege an einen Admin.
// Ziel: kein gescheiterter kritischer Op verwaist mehr stumm (Webhook-Strand #3232,
// 13 Kanzlei-Mandat-Pushes).

export type RecordFailedOpInput = {
  /** Routing-Key, z.B. 'stripe_webhook' / 'kanzlei_mandat_push'. */
  operationType: string
  /** Stabiler Per-Instanz-Key fuer Upsert-Dedup, z.B. `stripe_webhook:<event_id>`. */
  dedupKey: string
  entityType?: string | null
  entityId?: string | null
  /** Kontext / Daten fuer manuelle (oder kuenftige automatische) Recovery. */
  payload?: Record<string, unknown>
  error: string
  /** Minuten Grace bis der recovery-monitor eskaliert (laesst externe Retries laufen). Default 360 (6h). */
  escalateAfterMinutes?: number
}

/**
 * Persistiert eine gescheiterte kritische async-Operation ins Dead-Letter.
 * Idempotent per dedup_key: erster Fehler legt einen pending-Eintrag an, weitere
 * Fehler bumpen nur attempts + last_error (escalate_after bleibt bei laufendem
 * Fehlerzyklus stabil -> Eskalation Grace-nach-erstem-Fehler). Ein bereits
 * aufgeloester/eskalierter Eintrag wird bei neuem Fehler reaktiviert (frischer Zyklus).
 *
 * Schluckt eigene Fehler — das Dead-Letter darf den aufrufenden Handler NIE
 * zusaetzlich brechen.
 */
export async function recordFailedOperation(input: RecordFailedOpInput): Promise<void> {
  try {
    const db = deadLetterDb()
    const escalateAfter = new Date(
      Date.now() + (input.escalateAfterMinutes ?? 360) * 60_000,
    ).toISOString()
    const nowIso = new Date().toISOString()

    const { data: existing } = await db
      .from('failed_async_operations')
      .select('id, attempts, status')
      .eq('dedup_key', input.dedupKey)
      .maybeSingle()

    if (existing) {
      // Reaktivierung (war resolved/escalated) -> frischer Eskalations-Zyklus.
      // Laufender Fehlerzyklus (war pending) -> escalate_after NICHT vorschieben.
      const reactivating = existing.status !== 'pending'
      const patch: Record<string, unknown> = {
        attempts: (existing.attempts ?? 1) + 1,
        last_error: input.error.slice(0, 2000),
        status: 'pending',
        escalated_at: null,
        resolved_at: null,
        updated_at: nowIso,
      }
      if (reactivating) patch.escalate_after = escalateAfter
      await db.from('failed_async_operations').update(patch).eq('id', existing.id)
    } else {
      await db.from('failed_async_operations').insert({
        operation_type: input.operationType,
        dedup_key: input.dedupKey,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        payload: input.payload ?? {},
        last_error: input.error.slice(0, 2000),
        status: 'pending',
        attempts: 1,
        escalate_after: escalateAfter,
      })
    }
  } catch (err) {
    // Bewusst geschluckt: das Dead-Letter ist Best-Effort und darf den Handler nicht brechen.
    console.error('[dead-letter] recordFailedOperation fehlgeschlagen (geschluckt):', err)
  }
}

/**
 * Markiert eine zuvor gescheiterte Operation als aufgeloest (z.B. ein spaeterer
 * Retry war erfolgreich). No-op wenn kein offener Eintrag existiert. Schluckt eigene Fehler.
 */
export async function markOperationResolved(dedupKey: string): Promise<void> {
  try {
    const db = deadLetterDb()
    await db
      .from('failed_async_operations')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('dedup_key', dedupKey)
      .neq('status', 'resolved')
  } catch (err) {
    console.error('[dead-letter] markOperationResolved fehlgeschlagen (geschluckt):', err)
  }
}
