import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Reliability-Sweep: Recovery-Monitor.
 *
 * Laeuft regelmaessig (VPS-Crontab, z.B. alle 15 min) und eskaliert pending-Eintraege
 * im Dead-Letter (failed_async_operations), deren escalate_after verstrichen ist, an einen
 * Admin (kritischer Task). So verwaist KEIN gescheiterter kritischer async-Op (Webhook /
 * Cron / externer Push) mehr stumm — genau die Fehlerklasse hinter dem Webhook-Strand (#3232)
 * und den 13 still gescheiterten Kanzlei-Mandat-Pushes.
 *
 * Idempotent: nach Eskalation -> status='escalated' (faellt aus dem pending-Set; keine
 * Doppel-Tasks). Automatischer Retry pro operation_type ist ein spaeterer Hook — v1
 * persistiert + eskaliert (das Must-have: ein Mensch erfaehrt davon).
 *
 * VPS-Crontab-Eintrag (Aaron) — alle 15 Minuten:
 *   0,15,30,45 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/recovery-monitor
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // failed_async_operations: neue Tabelle, database.types.ts noch nicht regen't -> Cast (s. dead-letter.ts).
  const db = createAdminClient() as unknown as SupabaseClient
  const nowIso = new Date().toISOString()

  const { data: due, error } = await db
    .from('failed_async_operations')
    .select('id, operation_type, dedup_key, entity_type, entity_id, attempts, last_error')
    .eq('status', 'pending')
    .lte('escalate_after', nowIso)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[recovery-monitor] Query fehlgeschlagen:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }
  if (!due?.length) {
    return NextResponse.json({ ok: true, checked: 0, escalated: 0 })
  }

  let escalated = 0
  for (const op of due) {
    try {
      const entityHint =
        op.entity_type && op.entity_id
          ? ` (${op.entity_type} ${String(op.entity_id).slice(0, 8)})`
          : ''
      await createLinkedTask({
        titel: `Async-Op gescheitert: ${op.operation_type}${entityHint}`,
        beschreibung:
          `Eine kritische asynchrone Operation (${op.operation_type}) ist nach ${op.attempts} Versuch(en) ` +
          `nicht durchgelaufen und wurde nicht automatisch aufgeloest.\n\n` +
          `Entitaet: ${op.entity_type ?? '-'} / ${op.entity_id ?? '-'}\n` +
          `Dedup-Key: ${op.dedup_key}\n` +
          `Letzter Fehler: ${op.last_error ?? '-'}\n\n` +
          `Bitte pruefen und manuell nachziehen, dann diesen Task schliessen. ` +
          `(Dead-Letter: failed_async_operations.id=${op.id})`,
        prioritaet: 'kritisch',
        empfaenger_rolle: 'admin',
        typ: 'reliability',
        trigger_event: 'async_op_escalated',
      })
      await db
        .from('failed_async_operations')
        .update({ status: 'escalated', escalated_at: nowIso, updated_at: nowIso })
        .eq('id', op.id)
      escalated++
    } catch (err) {
      // Einzelne Eskalation darf den Lauf nicht brechen — naechster Eintrag.
      console.error(`[recovery-monitor] Eskalation fehlgeschlagen fuer ${op.dedup_key}:`, err)
    }
  }

  console.log(`[recovery-monitor] ${due.length} faellig, ${escalated} eskaliert`)
  return NextResponse.json({ ok: true, checked: due.length, escalated })
}
