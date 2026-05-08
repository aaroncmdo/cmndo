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

  // CMM-35: WhatsApp-Push an den Kunden bei Nachbesichtigung — der Kunde
  // muss aktiv werden (Termin abstimmen, Fahrzeug bereitstellen). Stellung-
  // nahme ist eine interne SV-Schreibaufgabe ohne Kunden-Beteiligung —
  // hier kein Push.
  if (typ === 'nachbesichtigung' && fallId) {
    try {
      const admin2 = createAdminClient()
      const { data: fallRow } = await admin2
        .from('faelle')
        .select('lead_id')
        .eq('id', fallId)
        .maybeSingle()
      const leadId = (fallRow?.lead_id as string | null) ?? null
      if (leadId) {
        const { data: lead } = await admin2
          .from('leads')
          .select('vorname, telefon')
          .eq('id', leadId)
          .maybeSingle()
        if (lead?.telefon) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
          const portalUrl = `${baseUrl}/kunde/faelle/${fallId}`
          const { sendCommunication } = await import('@/lib/communications/send')
          sendCommunication('nachbesichtigung_angefordert', {
            telefon: lead.telefon as string,
            vorname: (lead.vorname as string | null) ?? '',
            '1': (lead.vorname as string | null) ?? '',
            '2': portalUrl,
            fall_id: fallId,
          }).catch((err: unknown) =>
            console.error('[CMM-35] Nachbesichtigung-WA fehlgeschlagen (non-critical):', err),
          )
        }
      }
    } catch (err) {
      console.error('[CMM-35] Kunde-WA-Setup fehlgeschlagen (non-critical):', err)
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
