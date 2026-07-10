// Vertrieb-CRM P4: Bestands-Partner einer Rolle als BestandsLead[] fuer die Cross-Table-
// Dedup (Aaron: "keine Dupes gegen Leads UND Partner"). makler/werkstatt haben saubere
// Identitaets-Felder (firma/name, telefon, plz). sachverstaendige traegt Kontakt (telefon)
// in profiles -> ein robuster SV-Partner-Dedup braucht einen profiles-Join (Follow-up).
// Bewusst leer fuer SV, damit kein falsches "0 Dubletten" suggeriert wird; der SV-LEAD-Dedup
// laeuft unveraendert ueber ladeBestandsLeads.
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

  // sachverstaendiger: Identitaet (telefon/plz) liegt in profiles -> Follow-up (Join noetig).
  return []
}
