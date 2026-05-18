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
    // Lade existierendes seit_datum aus claims (CMM-44 SP-B PR2c: SSoT)
    const admin = createAdminClient()
    const { data: fallForCheck } = await admin
      .from('faelle')
      .select('claim_id')
      .eq('id', fallId)
      .maybeSingle()
    const checkClaimId = (fallForCheck as { claim_id?: string | null } | null)?.claim_id ?? null
    if (checkClaimId) {
      const { data: claimForCheck } = await admin
        .from('claims')
        .select('mietwagen_seit_datum')
        .eq('id', checkClaimId)
        .maybeSingle()
      if (!claimForCheck?.mietwagen_seit_datum) {
        return {
          success: false,
          error: 'Abhol-Datum ist erforderlich wenn Mietwagen aktiviert wird',
        }
      }
    } else {
      return {
        success: false,
        error: 'Abhol-Datum ist erforderlich wenn Mietwagen aktiviert wird',
      }
    }
  }

  const admin = createAdminClient()

  // CMM-44 SP-A2 (Cluster 2): mietwagen_hat → claims.hat_mietwagen (SSoT).
  // CMM-44 SP-B PR2c: alle mietwagen_*-Felder sind jetzt ebenfalls auf claims
  // (SSoT). Beide Pfade schreiben auf claims via claim_id.
  const { mietwagen_hat, ...claimsOnlyPatch } = patch

  // claim_id immer laden — alle Writes gehen auf claims
  const { data: fallRow } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fallRow as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) {
    return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
  }

  // hat_mietwagen-Patch (SP-A2) + mietwagen_*-Patch (SP-B PR2c) in einem Write
  const claimsUpdate: Record<string, unknown> = { ...claimsOnlyPatch }
  if (mietwagen_hat !== undefined) {
    claimsUpdate.hat_mietwagen = mietwagen_hat
  }

  if (Object.keys(claimsUpdate).length > 0) {
    const { error: claimErr } = await admin
      .from('claims')
      .update(claimsUpdate)
      .eq('id', claimId)
    if (claimErr) {
      return { success: false, error: claimErr.message }
    }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${fallId}`)

  return { success: true }
}
