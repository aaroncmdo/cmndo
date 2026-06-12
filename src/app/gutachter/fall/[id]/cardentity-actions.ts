'use server'

// AAR-311: Manueller Cardentity-Typ-B-Trigger aus der SV-Fallakte.
// Nur SV (sachverstaendiger) und Admin dürfen — der SV ruft das nach dem
// Termin auf, wenn er bei der Vor-Ort-Besichtigung Vorschadenhinweise
// gefunden hat (Lackschichtenmessung etc.).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CardentityRunResult } from '@/lib/cardentity/run-full'

export async function requestCardentityTypBForFallSv(
  fallId: string,
): Promise<CardentityRunResult> {
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
    return { success: false, error: 'Nur SV/Admin dürfen Typ-B triggern' }
  }

  // Sicherheits-Check: SV darf nur seinen eigenen Fall abfragen
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

  const { runCardentityCheck } = await import('@/lib/cardentity/run-full')
  const result = await runCardentityCheck('fall', fallId)
  if (result.success) revalidatePath(`/gutachter/fall/${fallId}`)
  return result
}
