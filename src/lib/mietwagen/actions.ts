'use server'

// AAR-759 Phase 2: Server-Actions für Mietwagen-Edit durch Admin/KB.
// Permission-Check via AAR-752 canWrite('stammdaten') — heute reicht
// Rolle-Check auf admin/kundenbetreuer.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type MietwagenUpdate = {
  mietwagen_hat?: boolean
  mietwagen_seit_datum?: string | null
  mietwagen_limit_tage?: number | null
  mietwagen_limit_grund?: string | null
  mietwagen_vermieter?: string | null
  mietwagen_argumentations_puffer?: number | null
  nutzungsausfall_tage?: number | null
}

export async function updateMietwagen(
  fallId: string,
  patch: MietwagenUpdate,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { success: false, error: 'Nur Admin und KB dürfen Mietwagen-Daten editieren' }
  }

  // Wenn mietwagen_hat=true gesetzt wird: seit_datum muss vorhanden sein
  // (DB-Constraint mietwagen_hat_hat_seit_datum). Frontend sollte das bereits
  // prüfen, aber defensiv nochmal server-seitig.
  if (patch.mietwagen_hat === true && patch.mietwagen_seit_datum === undefined) {
    // Lade existierendes seit_datum
    const admin = createAdminClient()
    const { data: fall } = await admin
      .from('faelle')
      .select('mietwagen_seit_datum')
      .eq('id', fallId)
      .maybeSingle()
    if (!fall?.mietwagen_seit_datum) {
      return {
        success: false,
        error: 'Abhol-Datum ist erforderlich wenn Mietwagen aktiviert wird',
      }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('faelle').update(patch).eq('id', fallId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)

  return { success: true }
}
