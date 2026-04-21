'use server'

// AAR-684 Phase 2: Chat + Timeline + manuelle Kommunikation.
// - sendChatNachricht: Insert in nachrichten + Benachrichtigung/WA-Fallback
//   an alle anderen Fall-Teilnehmer (Kunde/KB/SV)
// - addTimelineEntry: manueller Timeline-Eintrag aus der UI
// - sendManualWhatsAppAction: One-off WA-Nachricht, loggt in fall_communications

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendManualWhatsApp } from '@/lib/whatsapp'

export async function addTimelineEntry(
  fallId: string,
  data: { typ: string; titel: string; beschreibung?: string; kanal?: string },
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: data.typ,
    titel: data.titel,
    beschreibung: data.beschreibung || null,
    erstellt_von: user.id,
    metadata: data.kanal ? { kanal: data.kanal } : {},
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/faelle/${fallId}`)
}

// KFZ-114: manuelle WhatsApp-Nachricht aus der Fallakte
export async function sendManualWhatsAppAction(fallId: string, telefon: string, message: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  await sendManualWhatsApp(telefon, message, fallId)
}

export async function sendChatNachricht(fallId: string, kanal: string, nachricht: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal,
    sender_id: user.id,
    sender_rolle: profile?.rolle ?? 'admin',
    nachricht,
    hat_anhang: false,
  })

  if (error) throw new Error(error.message)

  // KFZ-129 / AAR-310: Benachrichtigung + WA-Fallback an alle Teilnehmer
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const senderName = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || 'Claimondo'
    const { data: fall } = await admin
      .from('faelle')
      .select('fall_nummer, lead_id, kunde_id, kundenbetreuer_id, sv_id')
      .eq('id', fallId)
      .single()

    type Empfaenger = { user_id: string; isKunde: boolean }
    const empfaenger: Empfaenger[] = []
    if (fall?.kunde_id && fall.kunde_id !== user.id) empfaenger.push({ user_id: fall.kunde_id, isKunde: true })
    if (fall?.kundenbetreuer_id && fall.kundenbetreuer_id !== user.id) empfaenger.push({ user_id: fall.kundenbetreuer_id, isKunde: false })
    if (fall?.sv_id) {
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).maybeSingle()
      if (sv?.profile_id && sv.profile_id !== user.id) empfaenger.push({ user_id: sv.profile_id, isKunde: false })
    }

    for (const e of empfaenger) {
      await admin.from('benachrichtigungen').insert({
        user_id: e.user_id,
        typ: 'chat',
        titel: `Neue Nachricht von ${senderName}`,
        beschreibung: nachricht.slice(0, 100),
        link: e.isKunde ? `/kunde/faelle/${fallId}` : `/faelle/${fallId}`,
      })

      if (e.isKunde && fall?.lead_id) {
        const { data: lead } = await admin.from('leads').select('telefon').eq('id', fall.lead_id).single()
        if (lead?.telefon) {
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('chat_fallback_kunde', {
            telefon: lead.telefon,
            fall_id: fallId,
            '1': fall?.fall_nummer ?? '',
            '2': nachricht.slice(0, 200),
          })
        }
      } else {
        const { data: p } = await admin.from('profiles').select('telefon').eq('id', e.user_id).single()
        if (p?.telefon) {
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('chat_fallback_kb', {
            telefon: p.telefon,
            fall_id: fallId,
            '1': fall?.fall_nummer ?? fallId.slice(0, 8),
            '2': nachricht.slice(0, 200),
          })
        }
      }
    }
  } catch { /* non-critical */ }

  revalidatePath(`/faelle/${fallId}`)
}
