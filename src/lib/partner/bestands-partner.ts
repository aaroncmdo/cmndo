// Vertrieb-CRM P4: Bestands-Partner einer Rolle als BestandsLead[] fuer die Cross-Table-
// Dedup (Aaron: "keine Dupes gegen Leads UND Partner"). makler/werkstatt haben saubere
// Identitaets-Felder direkt auf der Zeile (firma/name, telefon, plz). sachverstaendige traegt
// den Kontakt (telefon/plz) in profiles -> Zwei-Query-Join ueber profile_id (robuster als
// nested-FK-Select). So werden alle drei Rubriken gegen den Partner-Bestand dedupt.
import { createAdminClient } from '@/lib/supabase/admin'
import type { BestandsLead } from '@/lib/partner/scraping'

export async function ladeBestandsPartner(rolle: string): Promise<BestandsLead[]> {
  const admin = createAdminClient()

  if (rolle === 'makler') {
    const { data } = await admin.from('makler').select('firma, telefon, adresse_plz')
    return (data ?? []).map((r) => ({
      google_place_id: null,
      firma: (r.firma as string | null) ?? null,
      telefon: (r.telefon as string | null) ?? null,
      plz: (r.adresse_plz as string | null) ?? null,
    }))
  }

  if (rolle === 'werkstatt') {
    const { data } = await admin.from('werkstaetten').select('name, telefon, adresse_plz')
    return (data ?? []).map((r) => ({
      google_place_id: null,
      firma: (r.name as string | null) ?? null,
      telefon: (r.telefon as string | null) ?? null,
      plz: (r.adresse_plz as string | null) ?? null,
    }))
  }

  if (rolle === 'sachverstaendiger') {
    const { data: svs } = await admin.from('sachverstaendige').select('firmenname, profile_id')
    const rows = svs ?? []
    const profileIds = [...new Set(rows.map((r) => r.profile_id).filter((x): x is string => Boolean(x)))]
    const kontaktById: Record<string, { telefon: string | null; plz: string | null }> = {}
    if (profileIds.length > 0) {
      const { data: profs } = await admin.from('profiles').select('id, telefon, plz').in('id', profileIds)
      for (const p of profs ?? []) {
        kontaktById[p.id as string] = {
          telefon: (p.telefon as string | null) ?? null,
          plz: (p.plz as string | null) ?? null,
        }
      }
    }
    return rows.map((r) => {
      const k = r.profile_id ? kontaktById[r.profile_id as string] : undefined
      return {
        google_place_id: null,
        firma: (r.firmenname as string | null) ?? null,
        telefon: k?.telefon ?? null,
        plz: k?.plz ?? null,
      }
    })
  }

  return []
}
