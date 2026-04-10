'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// KFZ-182: Server Action zum Senden einer Chat-Nachricht aus der Gesamt-Inbox.

export async function sendNachrichtFromInbox(
  fallId: string,
  nachricht: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, twilio_whatsapp_nummer')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle)) {
    return { success: false, error: 'Nicht berechtigt' }
  }

  // 1. In nachrichten-Tabelle speichern
  const { error: insertErr } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'whatsapp',
    sender_id: user.id,
    sender_rolle: profile.rolle,
    nachricht: nachricht.trim(),
    richtung: 'outbound',
    kb_empfaenger_id: user.id,
  })
  if (insertErr) return { success: false, error: insertErr.message }

  // 2. WhatsApp senden an den Kunden (wenn Telefonnummer vorhanden)
  const { data: fall } = await supabase.from('faelle')
    .select('lead_id')
    .eq('id', fallId)
    .single()

  if (fall?.lead_id) {
    const { data: lead } = await supabase.from('leads')
      .select('telefon')
      .eq('id', fall.lead_id)
      .single()

    if (lead?.telefon) {
      try {
        const { sendWhatsApp } = await import('@/lib/whatsapp')
        await sendWhatsApp(lead.telefon, nachricht.trim())
      } catch (e) {
        console.error('[KFZ-182] WhatsApp send failed:', e)
      }
    }
  }

  revalidatePath('/admin/nachrichten', 'page')
  return { success: true }
}
