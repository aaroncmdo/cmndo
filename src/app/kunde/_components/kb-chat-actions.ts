'use server'

// Server-Actions für die Kunde-Chat-Modale (KB-Direktchat + Gruppenchat).
// fall_id optional — wird gesetzt wenn der Kunde sich explizit auf einen
// Fall bezieht (Reply-Preview-Picker), sonst NULL = allgemein.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type KundeChatKanal = 'chat_kb_kunde' | 'gruppenchat'

export async function sendKundeChatMessage(params: {
  nachricht: string
  kanal: KundeChatKanal
  empfaengerId: string
  fallId?: string | null
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  if (!params.nachricht.trim()) return { ok: false, error: 'Leere Nachricht' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()
  // Audit-Fix #7: messageId zurueckgeben damit Client das optimistic
  // Element deterministisch ersetzen kann (statt per sender_id+nachricht
  // Heuristik die bei zwei schnellen Sends mit gleichem Text doppelt).
  const { data: inserted, error } = await admin
    .from('nachrichten')
    .insert({
      fall_id: params.fallId ?? null,
      kanal: params.kanal,
      sender_id: user.id,
      sender_rolle: profile?.rolle ?? 'kunde',
      empfaenger_id: params.empfaengerId,
      nachricht: params.nachricht,
      richtung: 'outbound',
      gelesen: false,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[sendKundeChatMessage] insert error:', error.message)
    return { ok: false, error: error.message }
  }

  // BUGFIX: Kein revalidatePath mehr — der Chat ist eine Client-Komponente
  // mit Optimistic-Add + Realtime-Sub. revalidatePath('/kunde') hat den
  // KundenbetreuerCard-Server-Component neu gerendert, was neue Prop-
  // Referenzen (additionalSenderIds-Array) an KundeKbChat propagiert hat.
  // Dessen useEffect-Dependency hat sich damit "geaendert", die Subscription
  // wurde abgerissen + ein Re-Fetch ausgeloest, der das frisch gesendete
  // Insert nicht zuverlaessig zurueck-las (Race) — Effekt: Nachricht
  // verschwand kurz nach dem Senden aus der UI. Realtime + Optimistic
  // reichen vollstaendig, der Server muss den /kunde-Cache nicht anfassen.
  return { ok: true, messageId: inserted?.id as string | undefined }
}

export async function markKundeChatMessagesRead(kanal: KundeChatKanal): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false }

  await supabase
    .from('nachrichten')
    .update({ gelesen: true })
    .eq('kanal', kanal)
    .eq('empfaenger_id', user.id)
    .eq('gelesen', false)

  return { ok: true }
}

// ─── Backwards-Kompat-Wrapper (alte Aufrufe) ──────────────────────────────

export async function sendKbKundeMessage(params: {
  nachricht: string
  fallId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // CMM-44 SP-A: kundenbetreuer_id ist eine faelle<->claims-Duplikat-Spalte
  // → über den claims-Embed lesen + filtern (SSoT). !inner erzwingt, dass nur
  // Faelle mit verknuepftem Claim und gesetztem KB zurueckkommen.
  const admin = createAdminClient()
  const { data: kbFall } = await admin
    .from('faelle')
    .select('claims:claim_id!inner(kundenbetreuer_id)')
    .eq('kunde_id', user.id)
    .not('claims.kundenbetreuer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const kbClaim = Array.isArray(kbFall?.claims) ? kbFall.claims[0] : kbFall?.claims
  const kbId = (kbClaim?.kundenbetreuer_id as string | null) ?? null
  if (!kbId) return { ok: false, error: 'Kein Kundenbetreuer zugeordnet' }

  return sendKundeChatMessage({
    nachricht: params.nachricht,
    kanal: 'chat_kb_kunde',
    empfaengerId: kbId,
    fallId: params.fallId,
  })
}

export async function markKbKundeMessagesRead(): Promise<{ ok: boolean }> {
  return markKundeChatMessagesRead('chat_kb_kunde')
}
