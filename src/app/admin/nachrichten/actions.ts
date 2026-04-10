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
        // KFZ-182: KB-eigene Nummer nutzen wenn vorhanden
        if (profile.twilio_whatsapp_nummer) {
          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          if (accountSid && authToken) {
            let normalTo = lead.telefon.replace(/\s/g, '')
            if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
            if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
            const body = new URLSearchParams()
            body.set('From', `whatsapp:${profile.twilio_whatsapp_nummer}`)
            body.set('To', `whatsapp:${normalTo}`)
            body.set('Body', nachricht.trim())
            await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
              method: 'POST',
              headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
            })
          }
        } else {
          const { sendWhatsApp } = await import('@/lib/whatsapp')
          await sendWhatsApp(lead.telefon, nachricht.trim())
        }
      } catch (e) {
        console.error('[KFZ-182] WhatsApp send failed:', e)
      }
    }
  }

  revalidatePath('/admin/nachrichten', 'page')
  return { success: true }
}
