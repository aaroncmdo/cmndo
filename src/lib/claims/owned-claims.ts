// CMM-63 SP-C: Zentrale Auflösung der claim_ids, die einem Kunden gehören.
//
// Ownership-SSoT = claim_parties(rolle='geschaedigter').user_id. Bis faelle in
// Phase 6 (SP-L) gedroppt wird, gibt es zwei Transitions-Fallbacks:
//   • faelle.kunde_id (alte Pfade ohne claim_parties-Row)
//   • leads.email (frisch konvertierter Kunde, kunde_id/claim_parties noch leer)
//
// kunde-Reads filtern damit über `claims.in('id', ownedClaimIds)` bzw.
// `faelle.in('claim_id', ownedClaimIds)` statt direkt über `faelle.kunde_id` —
// sodass das kunde_id-Ownership-Coupling für den faelle-Drop verschwindet.
//
// Identische Sammel-Logik wie der interne Block in getKundeFaelle; bewusst als
// wiederverwendbares Primitiv extrahiert (getKundeFaelle kann es später adoptieren).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

/**
 * Liefert die claim_ids, die der Kunde besitzt (claim_parties-primär,
 * faelle.kunde_id + lead.email als Transitions-Fallback). `admin` muss ein
 * Service-Role-Client sein (RLS-Bypass für den tabellenübergreifenden Lookup).
 */
export async function getOwnedClaimIds(
  admin: DbClient,
  userId: string,
  email: string | null,
): Promise<string[]> {
  const claimIds = new Set<string>()

  // 1) claim_parties: User ist als Geschädigter eingetragen (Ownership-SSoT).
  const { data: parties } = await admin
    .from('claim_parties')
    .select('claim_id')
    .eq('user_id', userId)
    .eq('rolle', 'geschaedigter')
  for (const p of (parties ?? []) as Array<{ claim_id: string | null }>) {
    if (p.claim_id) claimIds.add(p.claim_id)
  }

  // 2) faelle.kunde_id-Fallback — alte Pfade ohne claim_parties.user_id
  //    (CMM-63-Transition: entfällt mit dem faelle-Drop in Phase 6).
  const { data: faelleByKunde } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('kunde_id', userId)
    .not('claim_id', 'is', null)
  for (const f of (faelleByKunde ?? []) as Array<{ claim_id: string | null }>) {
    if (f.claim_id) claimIds.add(f.claim_id)
  }

  // 3) Lead-Email-Fallback — Kunde frisch angelegt, kunde_id noch nirgends gesetzt.
  if (email) {
    const { data: leadIds } = await admin
      .from('leads')
      .select('id')
      .eq('email', email)
    const leadIdList = (leadIds ?? []).map((l) => l.id as string)
    if (leadIdList.length > 0) {
      const { data: claimsByLead } = await admin
        .from('claims')
        .select('id')
        .in('lead_id', leadIdList)
      for (const c of (claimsByLead ?? []) as Array<{ id: string }>) {
        claimIds.add(c.id)
      }
    }
  }

  return Array.from(claimIds)
}
