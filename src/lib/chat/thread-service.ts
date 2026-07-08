// Non-'use server' Service-Helfer fuer Chat-Threads. Nutzbar aus Webhooks (Inbound-Zustellung)
// UND aus thread-actions ('use server'). Getrennt, weil 'use server'-Funktionen keine
// SupabaseClient-Parameter erlauben (Serialisierung ueber die Client-Server-Grenze) — der
// Caller uebergibt hier seinen Service-Role-Client.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leiteGruppenTeilnehmer, type ClaimZuweisung } from './thread-model'

/** Synchronisiert Gruppen-Teilnehmer (nur gueltige auth.users — stale Refs pro Zeile ueberspringen). */
export async function syncGruppenTeilnehmer(
  admin: SupabaseClient,
  threadId: string,
  teilnehmer: { userId: string; rolle: string }[],
) {
  for (const t of teilnehmer) {
    const { error } = await admin
      .from('chat_thread_teilnehmer')
      .upsert({ thread_id: threadId, user_id: t.userId, rolle: t.rolle }, { onConflict: 'thread_id,user_id', ignoreDuplicates: true })
    if (error) continue // z.B. gedroppte auth.users-Referenz -> ueberspringen
  }
}

/**
 * Loest die Domain-IDs der Claim-Zuweisung auf auth-user_ids auf:
 * - sv_id ist eine sachverstaendige.id -> sachverstaendige.profile_id (= user_id)
 * - makler_id ist eine makler.id -> makler.user_id
 * geschaedigter_user_id + kundenbetreuer_id sind bereits user_ids (unveraendert).
 * OHNE diese Aufloesung landet die sachverstaendige.id als Teilnehmer-user_id -> der
 * auth.users-Guard im Teilnehmer-Sync verwirft sie -> der SV wird nie Thread-Mitglied.
 */
export async function resolveClaimUserIds(
  admin: SupabaseClient,
  claim: { geschaedigter_user_id: string | null; kundenbetreuer_id: string | null; sv_id: string | null; makler_id?: string | null },
): Promise<{ geschaedigter_user_id: string | null; kundenbetreuer_id: string | null; sv_id: string | null; makler_id: string | null }> {
  let svUserId: string | null = null
  if (claim.sv_id) {
    const { data } = await admin.from('sachverstaendige').select('profile_id').eq('id', claim.sv_id).maybeSingle()
    svUserId = (data as { profile_id: string | null } | null)?.profile_id ?? null
  }
  let maklerUserId: string | null = null
  if (claim.makler_id) {
    const { data } = await admin.from('makler').select('user_id').eq('id', claim.makler_id).maybeSingle()
    maklerUserId = (data as { user_id: string | null } | null)?.user_id ?? null
  }
  return {
    geschaedigter_user_id: claim.geschaedigter_user_id,
    kundenbetreuer_id: claim.kundenbetreuer_id,
    sv_id: svUserId,
    makler_id: maklerUserId,
  }
}

/**
 * Get-or-create kunde_gruppe/team_intern-Thread + Teilnehmer-Sync — OHNE Auth-Check, mit
 * uebergebenem Service-Role-Client. Fuer Webhooks (Inbound-Zustellung) UND die authed
 * holeOderErstelleGruppenThread (thread-actions). Gibt threadId oder null.
 */
export async function holeOderErstelleGruppenThreadService(
  admin: SupabaseClient,
  claimId: string,
  art: 'kunde_gruppe' | 'team_intern',
): Promise<string | null> {
  const { data: claim } = await admin
    .from('claims')
    .select('geschaedigter_user_id, kundenbetreuer_id, sv_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return null

  const { data: vorhanden } = await admin
    .from('chat_threads')
    .select('id')
    .eq('claim_id', claimId)
    .eq('art', art)
    .maybeSingle()
  let threadId = (vorhanden as { id: string } | null)?.id

  if (!threadId) {
    const { data: neu, error } = await admin
      .from('chat_threads')
      .insert({ claim_id: claimId, art })
      .select('id')
      .maybeSingle()
    if (error) return null
    threadId = (neu as { id: string } | null)?.id
  }
  if (!threadId) return null

  const resolved = await resolveClaimUserIds(admin, claim as ClaimZuweisung)
  await syncGruppenTeilnehmer(admin, threadId, leiteGruppenTeilnehmer(resolved, art))
  return threadId
}
