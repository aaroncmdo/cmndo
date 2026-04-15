'use server'

// AAR-163 / W3: Dokumente-Actions für die Fallakte.
// - triggerFinCallForFall: ruft Cardentity DAT/Audatex über enrichFallByFin
// - markDokumentNachgereicht: setzt nachgereicht_status auf pflichtdokumente
//   (AAR-163 Nachreichen-Flow)
//
// OCR + WA-Medien Auto-Filing bleiben Follow-ups:
// - Echter OCR-Impl (Tesseract.js / Google Vision) → braucht Provider-Wahl
// - Twilio-Inbound-Webhook erweitern → eigenes Ticket AAR-158

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function triggerFinCallForFall(
  fallId: string,
): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Rollen-Check: nur KB/Admin dürfen FIN-Call triggern
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Nur KB/Admin dürfen FIN-Call triggern' }
  }

  const { enrichFallByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichFallByFin(fallId)
  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/admin/faelle/${fallId}`)
  return { success: true, updatedFields: result.updatedFields }
}

/**
 * Nachreichen-Status auf einem Pflichtdokument setzen.
 * Status: 'ausstehend' (default) | 'nachgereicht_angefordert' | 'hochgeladen'
 * Der Reminder-Cron liest diese Spalte und triggert WA-Erinnerungen (W3
 * Cron-Erweiterung folgt wenn die Spalte in allen Consumer-Flows gepflegt
 * wird).
 */
export async function markDokumentNachgereicht(
  pflichtdokId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: pdok } = await supabase
    .from('pflichtdokumente')
    .select('fall_id')
    .eq('id', pflichtdokId)
    .single()
  if (!pdok) return { success: false, error: 'Pflichtdokument nicht gefunden' }

  // Das Status-Feld der Tabelle speichert den Lebenszyklus
  // (ausstehend/hochgeladen/geprueft) — wir ergänzen hier den Zwischenschritt
  // „nachgereicht_angefordert" als Text-Flag, damit die bestehenden
  // Dokumente-UI + Cron-Logik nichts brechen. Echte Migration auf eigene
  // Spalte nachgereicht_status kann folgen sobald klar ist dass mehrere
  // Stellen das Feld brauchen.
  const { error } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'nachgereicht_angefordert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', pflichtdokId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/admin/faelle/${pdok.fall_id}`)
  return { success: true }
}
