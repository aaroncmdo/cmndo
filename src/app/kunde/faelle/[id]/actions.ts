'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function sendNachricht(
  fallId: string,
  nachricht: string,
  kanal: 'portal-kunde-claimondo' | 'portal-kunde-gutachter' = 'portal-kunde-claimondo',
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  if (!nachricht.trim()) throw new Error('Nachricht darf nicht leer sein')

  // KFZ-127: Chat-Routing — empfaenger_id auf den zugewiesenen KB setzen
  let empfaengerId: string | null = null
  try {
    const admin = createAdminClient()
    const { data: fall } = await admin.from('faelle').select('kundenbetreuer_id, sv_id').eq('id', fallId).single()

    if (kanal === 'portal-kunde-claimondo' && fall?.kundenbetreuer_id) {
      empfaengerId = fall.kundenbetreuer_id
    } else if (kanal === 'portal-kunde-gutachter' && fall?.sv_id) {
      // SV profile_id als empfaenger
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
      empfaengerId = sv?.profile_id ?? null
    }
  } catch { /* Fallback: kein empfaenger — Admin sieht alles */ }

  const { error } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal,
    sender_id: user.id,
    sender_rolle: 'kunde',
    nachricht: nachricht.trim(),
    empfaenger_id: empfaengerId,
  })

  if (error) throw new Error(error.message)

  // KFZ-129: Benachrichtigung + WhatsApp an ALLE anderen Gruppen-Teilnehmer
  try {
    const admin = createAdminClient()
    const { data: fall } = await admin.from('faelle').select('fall_nummer').eq('id', fallId).single()
    const { data: gruppe } = await admin.from('chat_gruppen').select('id').eq('fall_id', fallId).maybeSingle()

    if (gruppe) {
      const { data: teilnehmer } = await admin
        .from('chat_teilnehmer')
        .select('user_id')
        .eq('gruppe_id', gruppe.id)
        .is('entfernt_am', null)
        .neq('user_id', user.id)

      for (const t of teilnehmer ?? []) {
        // Benachrichtigung
        await admin.from('benachrichtigungen').insert({
          user_id: t.user_id,
          typ: 'nachricht',
          titel: 'Neue Nachricht vom Kunden',
          beschreibung: nachricht.trim().slice(0, 100),
          link: `/admin/faelle/${fallId}`,
        })

        // WhatsApp Fallback
        const { data: profile } = await admin.from('profiles').select('telefon').eq('id', t.user_id).single()
        if (profile?.telefon) {
          const { sendWhatsApp } = await import('@/lib/whatsapp')
          await sendWhatsApp(profile.telefon, `Neue Kundennachricht in Fall ${fall?.fall_nummer ?? fallId.slice(0, 8)}: ${nachricht.trim().slice(0, 200)}`)
        }
      }
    } else if (empfaengerId) {
      // Fallback: alte Logik wenn keine Gruppe existiert
      await admin.from('benachrichtigungen').insert({
        user_id: empfaengerId,
        typ: 'nachricht',
        titel: 'Neue Nachricht vom Kunden',
        beschreibung: nachricht.trim().slice(0, 100),
        link: `/admin/faelle/${fallId}`,
      })
    }
  } catch { /* non-critical */ }

  revalidatePath(`/kunde/faelle/${fallId}`)
}
