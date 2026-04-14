'use server'

// AAR-108: Manuell ausgeloeste LexDrive-Events aus der Fallakte.
import { createClient } from '@/lib/supabase/server'
import { processLexDriveEvent, type LexDriveEvent, type LexDriveEventPayload } from '@/lib/lexdrive/process-event'
import { revalidatePath } from 'next/cache'

export async function triggerLexDriveEventManually(
  fallId: string,
  eventType: LexDriveEvent,
  payload: LexDriveEventPayload,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) {
    return { success: false, error: 'Nur Admin und KB duerfen Events manuell ausloesen' }
  }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const result = await processLexDriveEvent({
    fallId,
    fallNr: fall.fall_nummer ?? fallId.slice(0, 8),
    eventType,
    payload,
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/admin/faelle/${fallId}`)
  return { success: true }
}
