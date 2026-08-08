// C3a Fundament: drant die notifications_outbox. Spiegelt den Event-Worker
// (/api/notifications/process): Zwei-Schritt-Claim mit Lease gegen Doppel-Send,
// Retry-Backoff [1,5,30,120]min -> Dead-Letter + sichtbarer Dispatch-Task
// (schliesst P1b / Verfassung §8). Der eigentliche Versand delegiert an
// sendFallCommunication (COMMUNICATION_REGISTRY = Template-Layer UNTER der Outbox).
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { createLinkedTask } from '@/lib/tasks/create-task'

const BATCH_SIZE = 25
const BACKOFF_MINUTES = [1, 5, 30, 120]
const LEASE_MINUTES = 10

type OutboxRow = {
  id: string
  dedup_key: string
  template: string
  claim_id: string | null
  payload: Record<string, string> | null
  versuche: number
}

/**
 * Delay bis zum naechsten Versuch nach `versucheNeu` fehlgeschlagenen Zustellungen:
 * 1 -> 1min, 2 -> 5min, 3 -> 30min, 4 -> 120min; danach null = Dead-Letter.
 */
export function nextOutboxRetryAt(versucheNeu: number): string | null {
  if (versucheNeu > BACKOFF_MINUTES.length) return null
  return new Date(Date.now() + BACKOFF_MINUTES[versucheNeu - 1] * 60 * 1000).toISOString()
}

// Retries erschoepft -> ein sichtbarer Dispatch-Task (dedupliziert per task_code,
// Muster erstelleVsDispatchTask). tasks.typ hat KEINEN CHECK (verifiziert 05.08.),
// entity_type='fall'/prioritaet='dringend' sind CHECK-gueltig.
async function createDeadLetterTask(row: OutboxRow, fehler: string): Promise<void> {
  if (!row.claim_id) return
  const supabase = createAdminClient()
  const taskCode = `outbox_dead_letter:${row.dedup_key}`
  const { data: vorhanden } = await supabase
    .from('tasks')
    .select('id')
    .eq('task_code', taskCode)
    .in('status', ['offen', 'in-bearbeitung'])
    .maybeSingle()
  if (vorhanden) return
  await createLinkedTask({
    titel: `Benachrichtigung nicht zustellbar: ${row.template}`,
    beschreibung: `Die automatische Benachrichtigung "${row.template}" konnte nach mehreren Versuchen nicht zugestellt werden. Bitte manuell nachfassen.\n\nDetail: ${fehler}`,
    prioritaet: 'dringend',
    empfaenger_rolle: 'dispatch',
    claim_id: row.claim_id,
    fall_id: row.claim_id, // fallId === claimId (convert-lead-to-claim.ts)
    entity_type: 'fall',
    entity_id: row.claim_id,
    typ: 'benachrichtigung_fehler',
    task_code: taskCode,
    trigger_event: 'outbox_dead_letter',
    auto_erstellt: true,
  })
}

async function sendOne(row: OutboxRow): Promise<{ ok: boolean }> {
  const supabase = createAdminClient()
  // Template-Layer: sendFallCommunication rendert Empfaenger/Kanal selbst aus der Registry.
  // Pre-claim-Sends (claim_id NULL) sind C3c -> hier terminal-failed, damit nichts still verschwindet.
  if (!row.claim_id) {
    await supabase
      .from('notifications_outbox')
      .update({
        status: 'failed',
        fehler: 'kein claim_id (pre-claim-Send = C3c, noch nicht unterstuetzt)',
        next_retry_at: null,
      })
      .eq('id', row.id)
    return { ok: false }
  }
  try {
    const res = await sendFallCommunication(row.claim_id, row.template, row.payload ?? undefined)
    if (res.sent) {
      await supabase
        .from('notifications_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id)
      return { ok: true }
    }
    // sent=false = sauberer Nicht-Versand (kein Telefon o.ae.) -> kein Retry-Grund, aber
    // sichtbar festhalten (nicht still). Kein Dead-Letter-Task (kann legitim/Opt-out sein).
    await supabase
      .from('notifications_outbox')
      .update({ status: 'failed', fehler: `nicht gesendet: ${res.reason ?? 'unbekannt'}`, next_retry_at: null })
      .eq('id', row.id)
    return { ok: false }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const next = nextOutboxRetryAt(row.versuche + 1)
    await supabase
      .from('notifications_outbox')
      .update({
        status: 'failed',
        versuche: row.versuche + 1,
        next_retry_at: next,
        fehler: next ? msg : `[dead-letter nach ${row.versuche + 1} Versuchen] ${msg}`,
      })
      .eq('id', row.id)
    if (!next) await createDeadLetterTask(row, msg)
    return { ok: false }
  }
}

async function claimOutboxRows(ids?: string[]): Promise<OutboxRow[]> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const leaseIso = new Date(Date.now() + LEASE_MINUTES * 60 * 1000).toISOString()
  // Claimbar: pending | (failed & retry-due) | (sending & Lease abgelaufen; Instanz gestorben).
  // Werte sind selbst-generierte ISO-Timestamps (kein User-Input) -> keine .or-Injektion.
  const claimFilter =
    `status.eq.pending,` +
    `and(status.eq.failed,next_retry_at.lte.${nowIso}),` +
    `and(status.eq.sending,next_retry_at.lte.${nowIso})`

  let sel = supabase.from('notifications_outbox').select('id').or(claimFilter)
  if (ids && ids.length) sel = sel.in('id', ids)
  else sel = sel.order('created_at', { ascending: true }).limit(BATCH_SIZE)
  const { data: candidates } = await sel

  const candidateIds = (candidates ?? []).map((r: { id: string }) => r.id)
  if (candidateIds.length === 0) return []

  // Claim per update-returning mit re-checktem Status-Filter. Race-sicher (READ COMMITTED,
  // EvalPlanQual): der zweite Worker sieht status='sending'/next_retry_at=future -> matcht
  // den Filter nicht mehr -> 0 Rows -> kein Doppel-Send. (Muster: Event-Worker.)
  const { data: claimed, error } = await supabase
    .from('notifications_outbox')
    .update({ status: 'sending', next_retry_at: leaseIso })
    .in('id', candidateIds)
    .or(claimFilter)
    .select('id, dedup_key, template, claim_id, payload, versuche')
  if (error) {
    console.error('[outbox-worker] claim failed', error)
    return []
  }
  return (claimed ?? []) as OutboxRow[]
}

export async function processOutboxBatch(): Promise<{ processed: number; failed: number }> {
  const rows = await claimOutboxRows()
  let failed = 0
  for (const row of rows) {
    const r = await sendOne(row)
    if (!r.ok) failed += 1
  }
  return { processed: rows.length, failed }
}

export async function drainSingleOutbox(dedupKey: string): Promise<{ processed: number; failed: number }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('notifications_outbox')
    .select('id')
    .eq('dedup_key', dedupKey)
    .maybeSingle()
  if (!data) return { processed: 0, failed: 0 }
  const rows = await claimOutboxRows([data.id as string])
  let failed = 0
  for (const row of rows) {
    const r = await sendOne(row)
    if (!r.ok) failed += 1
  }
  return { processed: rows.length, failed }
}
