'use server'

// CMM Phase 1.5d: Server-Actions für Side-Quest-Auftraege
// (Nachbesichtigung, Stellungnahme).
//
// Voraussetzung: Erstgutachten ist QC-freigegeben → kanzlei_faelle existiert.
// Die DB-Validation läuft via trg_auftraege_validate_typ_requires_kanzleifall
// (Phase 1.5c). Die Server-Actions hier ergänzen Auth (Admin/KB), Timeline-
// Eintrag, optional SV-Mitteilung und revalidatePath.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSideQuestAuftrag, type SideQuestTyp } from './create'
import { revalidatePath } from 'next/cache'

async function requireKbOrAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { error: 'Nur Admin/KB darf Side-Quests anlegen' as const }
  }
  return {
    user,
    name: [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'KB',
  }
}

async function createSideQuest(
  claimId: string,
  typ: SideQuestTyp,
  grund: string | null,
): Promise<{ ok: boolean; auftragId?: string; error?: string }> {
  const auth = await requireKbOrAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const admin = createAdminClient()
  const result = await createSideQuestAuftrag(admin, claimId, typ)
  if (!result.ok || !result.auftragId) return result

  // Timeline-Eintrag für die Fallakte. fall_id über den frisch erstellten
  // Auftrag holen — der Helper hat das schon resolved.
  const { data: row } = await admin
    .from('auftraege')
    .select('fall_id, sv_id')
    .eq('id', result.auftragId)
    .maybeSingle()
  const fallId = row?.fall_id as string | undefined
  const svId = row?.sv_id as string | undefined

  if (fallId) {
    const titel = typ === 'nachbesichtigung' ? 'Nachbesichtigung beauftragt' : 'Stellungnahme beauftragt'
    try {
      await admin.from('timeline').insert({
        fall_id: fallId,
        typ: typ === 'nachbesichtigung' ? 'nachbesichtigung_beauftragt' : 'stellungnahme_beauftragt',
        titel,
        beschreibung: grund?.trim() || `${auth.name}: ${titel}`,
        erstellt_von: auth.user.id,
      })
    } catch (err) {
      console.warn('[createSideQuest] Timeline fehlgeschlagen:', err)
    }
  }

  // Mitteilung an den SV über den neuen Auftrag (non-critical).
  if (svId) {
    try {
      const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
      await createGutachterMitteilung(
        svId,
        typ === 'nachbesichtigung' ? 'nachbesichtigung_beauftragt' : 'stellungnahme_beauftragt',
        null,
        { grund: grund?.trim() || '', kommentar: auth.name },
      )
    } catch (err) {
      console.warn('[createSideQuest] Mitteilung fehlgeschlagen:', err)
    }
  }

  if (fallId) {
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/gutachter/fall/${fallId}`)
    revalidatePath(`/kunde/faelle/${fallId}`)
  }
  return { ok: true, auftragId: result.auftragId }
}

export async function createNachbesichtigung(
  claimId: string,
  grund?: string,
): Promise<{ ok: boolean; auftragId?: string; error?: string }> {
  return createSideQuest(claimId, 'nachbesichtigung', grund ?? null)
}

export async function createStellungnahme(
  claimId: string,
  grund?: string,
): Promise<{ ok: boolean; auftragId?: string; error?: string }> {
  return createSideQuest(claimId, 'stellungnahme', grund ?? null)
}
