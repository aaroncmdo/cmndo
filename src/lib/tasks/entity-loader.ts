'use server'

// AAR-307: Entity-Loader für das Task-Anlegen-Modal.
// Lädt Optionen für das „Bezugs-Entität"-Dropdown abhängig vom gewählten Typ.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

export type EntityOption = { id: string; label: string }

export async function ladeEntityOptions(
  typ: 'kunde' | 'sachverstaendiger' | 'kanzlei' | 'versicherung',
  fallId: string,
): Promise<EntityOption[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return []

  switch (typ) {
    case 'kunde': {
      // Kunden-Auswahl ist auf den konkreten Fall begrenzt (nur sein Kunde)
      const admin = createAdminClient()
      // CMM-49: claims-direkt (faelle-frei). geschaedigter_user_id == kunde_id
      // (0-diff 78/0/0); NON-Auth Dropdown-Option (kein Ownership-Check) -> Swap safe.
      // Lead-Name via claims.lead_id statt faelle-leads-Embed.
      const claimId = await resolveClaimId(admin, fallId)
      if (!claimId) return []
      const { data: claim } = await admin
        .from('claims')
        .select('geschaedigter_user_id, lead_id')
        .eq('id', claimId)
        .maybeSingle()
      if (!claim?.geschaedigter_user_id) return []
      let name = 'Kunde'
      if (claim.lead_id) {
        const { data: lead } = await admin
          .from('leads')
          .select('vorname, nachname')
          .eq('id', claim.lead_id as string)
          .maybeSingle()
        if (lead) name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Kunde'
      }
      return [{ id: claim.geschaedigter_user_id as string, label: name }]
    }
    case 'sachverstaendiger': {
      // SV-Liste kommt aus sachverstaendige + profiles (Namen aus profiles)
      const admin = createAdminClient()
      // AAR-658: Spalte heißt `ist_aktiv`, nicht `aktiv` — vorheriges Select
      // warf 400 und lieferte svs=null, Task-Dropdown war für SV immer leer.
      // Zusätzlich profiles-Embed disambiguieren (4 FKs auf profiles).
      const { data: svs, error: svErr } = await admin
        .from('sachverstaendige')
        .select('id, ist_aktiv, profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
        .eq('ist_aktiv', true)
        .is('geloescht_am', null)
      if (svErr) console.error('[entity-loader] SV-Query:', svErr.message)
      const options: EntityOption[] = []
      for (const s of svs ?? []) {
        const profileRaw = (s as unknown as { profiles: unknown }).profiles
        const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
          | { vorname: string | null; nachname: string | null }
          | null
        const name = profile
          ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim()
          : ''
        options.push({ id: s.id, label: name || s.id.slice(0, 8) })
      }
      return options.sort((a, b) => a.label.localeCompare(b.label, 'de'))
    }
    case 'kanzlei': {
      const { data } = await supabase
        .from('kanzleien')
        .select('id, name')
        .order('name')
      return (data ?? []).map((k) => ({ id: k.id, label: k.name ?? k.id.slice(0, 8) }))
    }
    case 'versicherung': {
      const { data } = await supabase
        .from('versicherungen')
        .select('id, name')
        .order('name')
      return (data ?? []).map((v) => ({ id: v.id, label: v.name ?? v.id.slice(0, 8) }))
    }
  }
}
