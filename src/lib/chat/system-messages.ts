import { createAdminClient } from '@/lib/supabase/admin'
import { ensureChatGruppe } from '@/lib/chatGruppe'

type SystemEvent = 'termin_abgelehnt' | 'termin_gegenvorschlag'

/**
 * KFZ-134: Postet eine System-Message im Gruppen-Chat eines Falls.
 * NUR fuer Ablehnung + Gegenvorschlag — KEINE System-Messages bei Annahme/Buchung.
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
  const gruppeId = await ensureChatGruppe(fallId)

  const { error } = await admin.from('nachrichten').insert({
    fall_id: fallId,
    gruppe_id: gruppeId,
    kanal: 'gruppe',
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
