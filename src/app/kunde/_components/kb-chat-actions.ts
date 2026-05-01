'use server'

// Server-Action für den KB↔Kunde-Chat (kanal-übergreifend, nicht pro Fall).
// fall_id ist optional — wird gesetzt wenn der Kunde sich explizit auf
// einen Fall bezieht ("Bezug zu CLM-XXX"), sonst NULL = allgemeine Frage.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function sendKbKundeMessage(params: {
  nachricht: string
  fallId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  if (!params.nachricht.trim()) return { ok: false, error: 'Leere Nachricht' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  // KB des Kunden ermitteln (Sticky-KB → über alle Fälle gleich).
  const admin = createAdminClient()
  const { data: kbFall } = await admin
    .from('faelle')
    .select('kundenbetreuer_id')
    .eq('kunde_id', user.id)
    .not('kundenbetreuer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const kbId = (kbFall?.kundenbetreuer_id as string | null) ?? null
  if (!kbId) return { ok: false, error: 'Kein Kundenbetreuer zugeordnet' }

  // Insert via Admin-Client um RLS-Edge-Cases (fall_id NULL,
  // kanal='chat_kb_kunde' vom Kunden) zu umgehen — wir haben die Owner-
  // schaft oben bereits geprueft (kbId aus Sticky-KB des Kunden).
  const { error } = await admin.from('nachrichten').insert({
    fall_id: params.fallId ?? null,
    kanal: 'chat_kb_kunde',
    sender_id: user.id,
    sender_rolle: profile?.rolle ?? 'kunde',
    empfaenger_id: kbId,
    nachricht: params.nachricht,
    richtung: 'outbound',
    gelesen: false,
  })
  if (error) {
    console.error('[sendKbKundeMessage] insert error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath('/kunde')
  if (params.fallId) revalidatePath(`/kunde/faelle/${params.fallId}`)
  return { ok: true }
}

export async function markKbKundeMessagesRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false }

  await supabase
    .from('nachrichten')
    .update({ gelesen: true })
    .eq('kanal', 'chat_kb_kunde')
    .eq('empfaenger_id', user.id)
    .eq('gelesen', false)

  return { ok: true }
}
