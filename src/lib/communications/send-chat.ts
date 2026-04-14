'use server'

// AAR-102: Chat-Nachricht senden (persistiert immer in nachrichten,
// bei kanal=whatsapp zusaetzlich via Twilio outbound)
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ChatKanal } from './channels'

export async function sendChatMessage(params: {
  fallId: string
  kanal: ChatKanal
  nachricht: string
  empfaengerId?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!params.nachricht?.trim()) return { success: false, error: 'Leere Nachricht' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('nachrichten').insert({
    fall_id: params.fallId,
    kanal: params.kanal,
    sender_id: user.id,
    sender_rolle: profile?.rolle ?? 'admin',
    empfaenger_id: params.empfaengerId ?? null,
    nachricht: params.nachricht,
    richtung: 'outbound',
    gelesen: false,
  })
  if (error) return { success: false, error: error.message }

  // Bei WhatsApp: zusaetzlich via Twilio outbound
  if (params.kanal === 'whatsapp') {
    try {
      const { data: fall } = await supabase
        .from('faelle')
        .select('lead_id, leads(telefon, vorname)')
        .eq('id', params.fallId)
        .single()
      const leadJoin = fall?.leads as unknown as { telefon: string | null; vorname: string | null } | { telefon: string | null; vorname: string | null }[] | null
      const lead = Array.isArray(leadJoin) ? leadJoin[0] : leadJoin
      if (lead?.telefon) {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('freitext', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? '',
          '1': params.nachricht,
        }).catch(() => {})
      }
    } catch (err) {
      console.error('[AAR-102] WhatsApp Outbound Fehler:', err)
    }
  }

  revalidatePath(`/admin/faelle/${params.fallId}`)
  revalidatePath('/admin/nachrichten')
  revalidatePath('/mitarbeiter/nachrichten')
  return { success: true }
}

// AAR-103: Nachricht zu einem anderen Fall verschieben (Multi-Fall-Kunde)
export async function moveNachrichtToFall(nachrichtId: string, newFallId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('nachrichten')
    .update({ fall_id: newFallId })
    .eq('id', nachrichtId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/nachrichten')
  revalidatePath(`/admin/faelle/${newFallId}`)
  return { success: true }
}

export async function markMessagesRead(fallId: string, kanal: ChatKanal): Promise<void> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return

  await supabase
    .from('nachrichten')
    .update({ gelesen: true })
    .eq('fall_id', fallId)
    .eq('kanal', kanal)
    .eq('gelesen', false)
    .neq('sender_id', user.id)
}
