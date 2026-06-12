'use server'

// AAR-315: SV erfasst nach dem Termin was er mit dem Kunden zur Abrechnungsart
// besprochen hat. Wird im Gespräch vor Ort geklärt — Dispatch darf das nicht
// vorab abfragen, weil Kunden dann anfangen zu recherchieren und die
// Konversation entgleist.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'

export type Abrechnungsart = 'fiktiv' | 'konkret' | 'noch-offen'

export async function saveAbrechnungsart(
  fallId: string,
  art: Abrechnungsart | null,
  notiz: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'sachverstaendiger'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur SV/Admin dürfen die Abrechnungsart setzen' }
  }

  if (rolle === 'sachverstaendiger') {
    // CMM-49 (faelle-Drop-Runway): sv_id aus v_claim_full (SSoT, flat) + sachverstaendige-Lookup
    // separat (faelle-frei). Gate unveraendert: der dem Fall zugewiesene SV-profile_id == user.id.
    const { data: fall } = await supabase
      .from('v_claim_full')
      .select('sv_id')
      .eq('fall_id', fallId)
      .maybeSingle()
    let svProfileId: string | null = null
    if (fall?.sv_id) {
      const { data: svRow } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id as string).maybeSingle()
      svProfileId = (svRow?.profile_id as string | null) ?? null
    }
    if (!svProfileId || svProfileId !== user.id) {
      return { success: false, error: 'Fall ist dir nicht zugewiesen' }
    }
  }

  // CMM-44 SP-B PR2c: abrechnungsart_* leben auf claims (SSoT) — Write via claim_id.
  const admin = createAdminClient()
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }

  const { error } = await admin
    .from('claims')
    .update({
      abrechnungsart_besprochen: art,
      abrechnungsart_notiz: notiz?.trim() || null,
      abrechnungsart_besprochen_am: art ? new Date().toISOString() : null,
    })
    .eq('id', claimId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}
