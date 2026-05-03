'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendFallCommunication } from '@/lib/communications/send-fall'

export async function waehleNachbesichtigungsTermin(
  fallId: string,
  datum: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Prüfe ob der Fall dem Kunden gehört und nachbesichtigung_status = angefordert
  const { data: fall } = await db
    .from('faelle')
    .select('id, nachbesichtigung_status, kunde_id, lead_id')
    .eq('id', fallId)
    .single()

  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // Zugehörigkeit prüfen
  const isOwner = fall.kunde_id === user.id
  if (!isOwner) {
    // Fallback: Lead-Owner?
    if (fall.lead_id) {
      const { data: lead } = await db.from('leads').select('user_id').eq('id', fall.lead_id).single()
      if (lead?.user_id !== user.id) return { success: false, error: 'Nicht autorisiert' }
    } else {
      return { success: false, error: 'Nicht autorisiert' }
    }
  }

  if (fall.nachbesichtigung_status !== 'angefordert') {
    return { success: false, error: 'Keine offene Nachbesichtigung' }
  }

  await db.from('faelle').update({
    nachbesichtigung_termin_datum: datum,
    nachbesichtigung_status: 'termin-gewaehlt',
  }).eq('id', fallId)

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Nachbesichtigungstermin gewählt',
    beschreibung: `Kunde hat ${new Date(datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} gewählt.`,
  })

  // WA: Termin bestaetigt
  sendFallCommunication(fallId, 'nachbesichtigung_termin').catch(() => {})

  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/kunde/nachbesichtigung`)
  return { success: true }
}
