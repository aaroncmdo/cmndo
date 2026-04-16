'use server'

// AAR-311: Manueller Cardentity-Typ-B-Trigger aus der SV-Fallakte.
// Nur SV (sachverstaendiger) und Admin dürfen — der SV ruft das nach dem
// Termin auf, wenn er bei der Vor-Ort-Besichtigung Vorschadenhinweise
// gefunden hat (Lackschichtenmessung etc.).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RequestTypBResult } from '@/lib/cardentity/typ-b'

export async function requestCardentityTypBForFallSv(
  fallId: string,
): Promise<RequestTypBResult> {
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

  const { requestCardentityTypB } = await import('@/lib/cardentity/typ-b')
  const result = await requestCardentityTypB('fall', fallId)
  if (result.success) revalidatePath(`/gutachter/fall/${fallId}`)
  return result
}
