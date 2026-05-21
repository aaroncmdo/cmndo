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
  // CMM-44 SP-D PR2a: nachbesichtigung_status aus gutachter_termine (aktueller Termin, SSoT).
  const { data: fall } = await db
    .from('faelle')
    .select('id, claim_id, kunde_id, lead_id')
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

  let aktTerminNB: { nachbesichtigung_status: string | null } | null = null
  if (fall.claim_id) {
    const { data: at } = await db
      .from('gutachter_termine')
      .select('nachbesichtigung_status')
      .eq('claim_id', fall.claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminNB = at
  }

  if (aktTerminNB?.nachbesichtigung_status !== 'angefordert') {
    return { success: false, error: 'Keine offene Nachbesichtigung' }
  }

  // CMM-44 SP-D PR2b: nachbesichtigung_termin_datum + _status → gutachter_termine (aktueller Termin, SSoT).
  // aktTerminNB kommt aus dem oben geladenen current-termin-Query — wir brauchen nur die id.
  let nachbTerminId: string | null = null
  if (fall.claim_id) {
    const { data: t } = await db.from('gutachter_termine').select('id')
      .eq('claim_id', fall.claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    nachbTerminId = (t?.id as string | null) ?? null
  }
  if (nachbTerminId) {
    await db.from('gutachter_termine').update({
      nachbesichtigung_termin_datum: datum,
      nachbesichtigung_status: 'termin-gewaehlt',
    }).eq('id', nachbTerminId)
  } else {
    console.warn(`[CMM-44 SP-D] kein Termin fuer fall ${fallId} — nachbesichtigung_* skip`)
  }

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
