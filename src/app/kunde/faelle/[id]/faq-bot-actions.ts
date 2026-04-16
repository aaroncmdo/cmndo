'use server'

// AAR-319: FAQ-Bot Server-Action für Kunde. Lädt/erstellt ki_gespraeche-
// Zeile (fall + rolle=kunde + user_id), ruft Claude-API, persistiert
// Verlauf.

import { createClient } from '@/lib/supabase/server'
import { askFaqBot, type ChatMessage } from '@/lib/faq-bot/ask'
import { revalidatePath } from 'next/cache'

export type FaqBotAnswer =
  | { success: true; antwort: string; history: ChatMessage[] }
  | { success: false; error: string }

export async function askKundenFaq(
  fallId: string,
  frage: string,
): Promise<FaqBotAnswer> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Kunde muss den Fall besitzen
  const { data: fall } = await supabase
    .from('faelle')
    .select('kunde_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall || fall.kunde_id !== user.id) {
    return { success: false, error: 'Fall nicht zugewiesen' }
  }

  // Bestehende Gesprächs-Historie laden (oder leer starten)
  const { data: existing } = await supabase
    .from('ki_gespraeche')
    .select('id, nachrichten')
    .eq('fall_id', fallId)
    .eq('rolle', 'kunde')
    .eq('user_id', user.id)
    .maybeSingle()

  const history: ChatMessage[] = Array.isArray(existing?.nachrichten)
    ? (existing.nachrichten as ChatMessage[])
    : []

  const result = await askFaqBot(fallId, frage, 'kunde', history)
  if (!result.success) return { success: false, error: result.error }

  const now = new Date().toISOString()
  const nextHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: frage.trim(), ts: now },
    { role: 'assistant', content: result.antwort, ts: new Date().toISOString() },
  ]

  // AAR-319: upsert statt check-dann-insert, damit Double-Click-Race keine
  // unique_violation auf (fall_id, rolle, user_id) produziert.
  await supabase
    .from('ki_gespraeche')
    .upsert(
      {
        fall_id: fallId,
        rolle: 'kunde',
        user_id: user.id,
        nachrichten: nextHistory,
        updated_at: now,
      },
      { onConflict: 'fall_id,rolle,user_id' },
    )

  revalidatePath(`/kunde/faelle/${fallId}`)
  return { success: true, antwort: result.antwort, history: nextHistory }
}

export async function ladeKundenFaqHistorie(
  fallId: string,
): Promise<ChatMessage[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return []

  const { data } = await supabase
    .from('ki_gespraeche')
    .select('nachrichten')
    .eq('fall_id', fallId)
    .eq('rolle', 'kunde')
    .eq('user_id', user.id)
    .maybeSingle()

  return Array.isArray(data?.nachrichten) ? (data.nachrichten as ChatMessage[]) : []
}
