'use server'

// Server-Action fuer den Werkstatt-Chat. Postet in den geteilten `gruppenchat`-
// Kanal des Falls (wie der Makler-Chat, kanal-basiert). Ownership-Gate =
// getWerkstattAuftrag (v_werkstatt_auftrag RLS is_werkstatt_for_claim); danach
// Insert via Admin-Client — die Werkstatt hat KEINE permissive nachrichten-INSERT-
// Policy (can_access_claim kennt sie nicht), der RLS-scoped Client wuerde still
// abgewiesen (analog maklerSendMessage). Das Ownership-Gate IST die Grenze.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWerkstattByUserId, getWerkstattAuftrag } from '@/lib/werkstatt/queries'
import { holeOderErstelleGruppenThreadService } from '@/lib/chat/thread-service'

const schema = z.object({
  claimId: z.string().uuid(),
  inhalt: z.string().min(1).max(2000),
})

export type WerkstattSendMessageResult =
  | { success: true; messageId: string }
  | { success: false; error: string }

export async function werkstattSendMessage(input: {
  claimId: string
  inhalt: string
}): Promise<WerkstattSendMessageResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Ungültige Eingabe.' }

  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) return { success: false, error: 'Werkstatt-Profil nicht gefunden.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nicht authentifiziert.' }

  // Ownership-Gate: v_werkstatt_auftrag-RLS. null = kein Zugriff auf diesen Fall.
  const auftrag = await getWerkstattAuftrag(parsed.data.claimId)
  if (!auftrag) return { success: false, error: 'Kein Zugriff auf diesen Auftrag.' }

  const admin = createAdminClient()
  const { data: bridge } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', parsed.data.claimId)
    .maybeSingle()
  const fallId = ((bridge as { fall_id?: string } | null)?.fall_id) ?? parsed.data.claimId

  // v2-Cutover (analog maklerSendMessage / #4349): die Werkstatt-Nachricht zusaetzlich in den
  // `kunde_gruppe`-THREAD schreiben (thread_id), damit Kunde/KB/SV sie in ihren v2-Thread-
  // Surfaces (ClaimChatInbox/ClaimChatPanel, die per thread_id lesen) sehen. Ohne thread_id
  // (nur kanal='gruppenchat', v1) sah die Werkstatt-Nachricht KEINE v2-Surface — der Werkstatt-
  // Chat war end-to-end tot (gleicher Bug wie Makler vor #4349). kanal='gruppenchat' bleibt fuer
  // v1-Kompat + Werkstatt-Realtime. Thread get-or-create haengt Kunde/KB/SV als Teilnehmer an.
  const threadId = await holeOderErstelleGruppenThreadService(
    admin as unknown as SupabaseClient,
    parsed.data.claimId,
    'kunde_gruppe',
  )

  const { data: inserted, error } = await admin
    .from('nachrichten')
    .insert({
      fall_id: fallId,
      claim_id: parsed.data.claimId,
      thread_id: threadId,
      kanal: 'gruppenchat',
      sender_id: user.id,
      sender_rolle: 'werkstatt',
      nachricht: parsed.data.inhalt,
      hat_anhang: false,
      is_system: false,
      gelesen: false,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { success: false, error: error?.message ?? 'Nachricht konnte nicht gesendet werden.' }
  }

  revalidatePath(`/werkstatt/auftraege/${parsed.data.claimId}`)
  revalidatePath(`/faelle/${fallId}`)
  return { success: true, messageId: inserted.id as string }
}
