'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type SystemEvent = 'termin_abgelehnt' | 'termin_gegenvorschlag'

/**
 * KFZ-134 / AAR-310: Postet eine System-Message im Gruppenchat eines Falls.
 * NUR für Ablehnung + Gegenvorschlag — KEINE System-Messages bei Annahme/Buchung.
 *
 * AAR-310: Verzichtet auf das tote chat_gruppen-Konzept (Tabelle existiert
 * nicht mehr). Schreibt direkt in nachrichten mit kanal='gruppenchat'.
 */
export async function postChatSystemMessage({
  fallId,
  text,
  event,
}: {
  fallId: string
  text: string
  event: SystemEvent
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'gruppenchat',
    sender_id: null,
    sender_rolle: 'system',
    nachricht: text,
    hat_anhang: false,
    is_system: true,
    system_event: event,
  })

  if (error) {
    console.error('[KFZ-134] System-Message fehlgeschlagen:', error.message)
  }
}
