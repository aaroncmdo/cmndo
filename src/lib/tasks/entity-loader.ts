'use server'

// AAR-307: Entity-Loader für das Task-Anlegen-Modal.
// Lädt Optionen für das „Bezugs-Entität"-Dropdown abhängig vom gewählten Typ.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      // AAR-658: faelle hat 2 FKs auf leads (lead_id + konvertiert_von_lead),
      // Embed braucht FK-Hint sonst PGRST201.
      const { data: fall } = await admin
        .from('faelle')
        .select('kunde_id, lead_id, leads!faelle_lead_id_fkey(vorname, nachname)')
        .eq('id', fallId)
        .maybeSingle()
      if (!fall?.kunde_id) return []
      const leadRaw = (fall as { leads: unknown } | null)?.leads
      const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
        | { vorname: string | null; nachname: string | null }
        | null
      const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : 'Kunde'
      return [{ id: fall.kunde_id, label: name || 'Kunde' }]
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
