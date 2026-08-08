// C3a Fundament (Notification-Outbox): der EINZIGE Schreib-Eingang in die
// notifications_outbox. enqueue() erzwingt einen dedup_key (Typ) und schreibt
// ON CONFLICT (dedup_key) DO NOTHING -> doppeltes enqueue = 1 Row = 1 Versand
// (schliesst die P1a-Dedup-Luecke strukturell). Der Versand laeuft ueber den
// Worker (outbox-worker.ts), angedockt an /api/notifications/process.
import { createAdminClient } from '@/lib/supabase/admin'

export type OutboxChannel = 'whatsapp' | 'email' | 'sms' | 'in_app'

export type OutboxEnqueueInput = {
  dedupKey: string
  kanal: OutboxChannel
  template: string
  claimId?: string | null
  empfaengerUserId?: string | null
  empfaengerRolle?: string | null
  payload?: Record<string, string>
}

export type OutboxEnqueueResult = { ok: boolean; enqueued: boolean; error?: string }

/**
 * Dedup-Key-Konvention (Prep §2): <template>:<claimId>[:<empfaenger>][:<fenster>].
 * Verallgemeinert das bewaehrte erstelleVsDispatchTask-Muster (task_code + Existenz-Check)
 * auf alle Sends. Der Key MUSS stabil sein: gleicher Anlass -> gleicher Key -> genau 1 Versand.
 */
export function buildDedupKey(parts: {
  template: string
  claimId: string
  empfaenger?: string
  fenster?: string
}): string {
  return [parts.template, parts.claimId, parts.empfaenger, parts.fenster]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(':')
}

export async function enqueue(input: OutboxEnqueueInput): Promise<OutboxEnqueueResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('notifications_outbox')
    .upsert(
      {
        dedup_key: input.dedupKey,
        kanal: input.kanal,
        template: input.template,
        claim_id: input.claimId ?? null,
        empfaenger_user_id: input.empfaengerUserId ?? null,
        empfaenger_rolle: input.empfaengerRolle ?? null,
        payload: input.payload ?? {},
        status: 'pending',
      },
      { onConflict: 'dedup_key', ignoreDuplicates: true },
    )
    .select('id')

  if (error) {
    console.error('[outbox] enqueue failed', input.dedupKey, error)
    return { ok: false, enqueued: false, error: error.message }
  }

  // ignoreDuplicates=true -> bei dedup_key-Konflikt kommt eine leere Row-Liste zurueck
  // (nichts eingefuegt = schon in der Outbox). enqueued=false, aber ok=true.
  const enqueued = Array.isArray(data) && data.length > 0

  // Immediate-Drain fire-and-forget (Latenz-Erhalt gegenueber dem heute synchronen Send):
  // nur bei echtem Insert. Faellt der Trigger aus, nimmt der */5min-Cron die pending-Row auf.
  if (enqueued) {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000'
    const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
    fetch(`${fullUrl}/api/notifications/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.CRON_SECRET ?? '' },
      body: JSON.stringify({ outboxDedupKey: input.dedupKey }),
    }).catch((e) => console.error('[outbox] immediate-drain trigger failed (Cron faengt es):', e))
  }

  return { ok: true, enqueued }
}
