'use server'

// AAR-315: SV erfasst nach dem Termin was er mit dem Kunden zur Abrechnungsart
// besprochen hat. Wird im Gespräch vor Ort geklärt — Dispatch darf das nicht
// vorab abfragen, weil Kunden dann anfangen zu recherchieren und die
// Konversation entgleist.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    const { data: fall } = await supabase
      .from('faelle')
      .select('sv_id, sachverstaendige(profile_id)')
      .eq('id', fallId)
      .maybeSingle()
    const svRaw = (fall as { sachverstaendige: unknown } | null)?.sachverstaendige
    const sv = (Array.isArray(svRaw) ? svRaw[0] : svRaw) as { profile_id: string } | null
    if (!sv?.profile_id || sv.profile_id !== user.id) {
      return { success: false, error: 'Fall ist dir nicht zugewiesen' }
    }
  }

  // CMM-44 SP-B PR2c: abrechnungsart_* leben auf claims (SSoT) — Write via claim_id.
  const admin = createAdminClient()
  const { data: fallRow } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fallRow as { claim_id?: string | null } | null)?.claim_id ?? null
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
