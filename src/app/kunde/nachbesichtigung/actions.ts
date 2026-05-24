'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendFallCommunication } from '@/lib/communications/send-fall'
// CMM-63 SP-C: Ownership zentral über claim_parties (SSoT). Ersetzt den inline-Check
// (faelle.kunde_id + leads.user_id-Fallback) durch den prod-erprobten Helper
// (claim_parties-primär + faelle.kunde_id + leads.email-Fallback).
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

export async function waehleNachbesichtigungsTermin(
  fallId: string,
  datum: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Zugehörigkeit prüfen (CMM-63 SP-C: zentraler Helper, claim_parties-SSoT)
  const ownership = await assertKundeOwnsFall(db, user.id, user.email ?? null, fallId)
  if (!ownership.ok) {
    return { success: false, error: ownership.error === 'not_found' ? 'Fall nicht gefunden' : 'Nicht autorisiert' }
  }

  let aktTerminNB: { nachbesichtigung_status: string | null } | null = null
  if (ownership.claimId) {
    const { data: at } = await db
      .from('gutachter_termine')
      .select('nachbesichtigung_status')
      .eq('claim_id', ownership.claimId)
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
  if (ownership.claimId) {
    const { data: t } = await db.from('gutachter_termine').select('id')
      .eq('claim_id', ownership.claimId)
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
