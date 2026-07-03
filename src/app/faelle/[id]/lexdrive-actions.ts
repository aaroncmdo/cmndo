'use server'

// AAR-108: Manuell ausgeloeste LexDrive-Events aus der Fallakte.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { processLexDriveEvent, type LexDriveEvent, type LexDriveEventPayload } from '@/lib/lexdrive/process-event'
import { revalidatePath } from 'next/cache'

export async function triggerLexDriveEventManually(
  fallId: string,
  eventType: LexDriveEvent,
  payload: LexDriveEventPayload,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) {
    return { success: false, error: 'Nur Admin und KB duerfen Events manuell ausloesen' }
  }

  const llClaimId = await resolveClaimId(supabase, fallId)
  const { data: fallClaim } = llClaimId
    ? await supabase.from('claims').select('claim_nummer').eq('id', llClaimId).maybeSingle()
    : { data: null }
  if (!fallClaim) return { success: false, error: 'Fall nicht gefunden' }

  const result = await processLexDriveEvent({
    fallId,
    fallNr: fallClaim?.claim_nummer ?? fallId.slice(0, 8),
    eventType,
    payload,
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

// AAR-108: Liest, welche Events für diesen Fall bereits verarbeitet wurden — für
// die ✓/⏳-Fortschritts-Badges im Endpoint-Register (manueller Abschluss-Workflow).
// Ohne diese Anzeige verliert man bei ~24 Events die Übersicht, was schon ausgelöst
// wurde. Gating identisch zum Trigger (admin+KB); der webhook_events-Read läuft über
// den Admin-Client (RLS-frei) — die Autorisierung ist das Rollen-Gate oben.
export async function getProcessedLexDriveEvents(
  fallId: string,
): Promise<Record<string, boolean>> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return {}

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) return {}

  const admin = createAdminClient()
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return {}

  const { data } = await admin
    .from('webhook_events')
    .select('event_type')
    .eq('claim_id', claimId)
    .eq('status', 'processed')

  const map: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const t = (row as { event_type?: string | null }).event_type
    if (t) map[t] = true
  }
  return map
}
