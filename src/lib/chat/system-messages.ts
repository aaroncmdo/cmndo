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
  templateKey,
  templateParams,
}: {
  fallId: string
  text: string
  event: SystemEvent
  // i18n Phase 1: optionaler Template-Key + Params, damit der Kunde-Renderer
  // die System-Message in der Leser-Sprache via next-intl rendern kann. text
  // bleibt als de-Fallback in nachricht.
  templateKey?: string
  templateParams?: Record<string, string | number>
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
    template_key: templateKey ?? null,
    template_params: templateParams ?? null,
  })

  if (error) {
    console.error('[KFZ-134] System-Message fehlgeschlagen:', error.message)
  }
}
