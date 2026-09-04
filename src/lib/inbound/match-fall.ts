// AAR-103: Match Inbound-Call/Message to the right Fall bei Multi-Fall-Kunden.
// Liefert den aktuellsten offenen Fall + Liste aller Kandidaten fuer manuelles Switching.

import type { createAdminClient } from '@/lib/supabase/admin'
import { CLOSED_OPERATIVE_STATUS_PG } from '@/lib/claims/terminal-status'

type AdminClient = ReturnType<typeof createAdminClient>

export type MatchedFall = {
  id: string
  claim_nummer: string | null
  status: string | null
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kunde_id: string | null
  created_at: string
}

export type MatchResult = {
  fallId: string | null
  leadId: string | null
  multipleCandidates: boolean
  candidates: MatchedFall[]
}

/**
 * Matcht eingehende Telefonnummer auf den aktuell wahrscheinlichsten Fall.
 * Logik: offene Faelle (nicht abgeschlossen/storniert) des Kunden, sortiert
 * nach created_at DESC. Wenn der Kunde mehrere offene Faelle hat, wird der
 * aktuellste als Default gewaehlt und multipleCandidates=true gesetzt.
 */
export async function matchInboundToFall(
  admin: AdminClient,
  phoneNumber: string,
): Promise<MatchResult> {
  const normalized = phoneNumber.replace(/[^0-9]/g, '')
  const suffix = normalized.slice(-9)
  if (!suffix) return { fallId: null, leadId: null, multipleCandidates: false, candidates: [] }

  // Lead-Match + Kunden-Match parallel.
  //
  // Verglichen wird gegen telefon_ziffern (generierte Nur-Ziffern-Spalte), NICHT gegen
  // telefon: `suffix` ist bereits von allen Nicht-Ziffern befreit, die Spalte war es nicht.
  // Ein `ilike '%775799941%'` auf dem Rohwert verfehlt jede Nummer, in der ein Trennzeichen
  // mitten im Suffix steht — z.B. '+49 177 5799941' (Lead 5c39b0ac, prod 30.08.): 0 Treffer,
  // obwohl es dieselbe Nummer ist. Die Spalte traegt beide Formate, `telefon` ist also kein
  // Formatvertrag; erst wenn Nadel UND Heuhaufen normalisiert sind, ist der Vergleich gueltig.
  const [leadsRes, kundenRes] = await Promise.all([
    admin
      .from('leads')
      .select('id, konvertiert_zu_fall_id')
      .like('telefon_ziffern', `%${suffix}%`)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'kunde')
      .like('telefon_ziffern', `%${suffix}%`)
      .limit(5),
  ])

  const leads = leadsRes.data ?? []
  const kunden = kundenRes.data ?? []
  const kundeIds = kunden.map(k => k.id)
  const fallIdsFromLeads = leads.map(l => l.konvertiert_zu_fall_id).filter(Boolean) as string[]

  if (kundeIds.length === 0 && fallIdsFromLeads.length === 0) {
    // Kein bekannter Kunde/Lead — nur Lead (ggf. neu zuzuordnen) liefern
    const firstLead = leads[0]?.id ?? null
    return { fallId: null, leadId: firstLead, multipleCandidates: false, candidates: [] }
  }

  // CMM-65: created_at lebt auf claims (SSoT). claim_id NOT NULL -> !inner verlustfrei.
  // CMM-74 b″: Offen-Filter auf claims.operative_status (SSoT, 1:1-Mirror von faelle.status).
  // Zwei-Schritt (PostgREST kann nicht nach Embed-Spalte negieren): erst die nicht-
  // abgeschlossenen/-stornierten claim-IDs, dann .in('claim_id', …).
  const { data: openClaims } = await admin
    .from('claims')
    .select('id')
    .not('operative_status', 'in', CLOSED_OPERATIVE_STATUS_PG)
  const openClaimIds = (openClaims ?? []).map((c) => c.id as string)

  // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge + claims!inner statt .from('faelle').
  // fall_id==faelle.id (Output-Key); kunde_id -> claims.geschaedigter_user_id (SSoT, div=0);
  // kennzeichen/fahrzeug_* -> vehicles via claims.vehicle_id (faelle-Snapshot war 0-populated
  // -> value-neutral); status -> claims.operative_status (SSoT). created_at -> claims (CMM-65).
  // kunde_id (-> embedded claims-Spalte) und id (-> bridge.fall_id, Anchor) liegen nach der
  // Migration auf VERSCHIEDENEN Tabellen -> ein gemeinsames .or() geht nicht. Stattdessen je
  // Quelle eine Query + Merge/Dedupe nach fall_id (orParts war ohnehin max. 2 Teile).
  const SELECT =
    'fall_id, claim_id, claims:claims!fk_bridge_claim!inner(claim_nummer, operative_status, created_at, geschaedigter_user_id, vehicle_id, vehicles:vehicle_id(kennzeichen_aktuell, hersteller, modell_haupttyp))'
  const bridgeQueries = []
  if (kundeIds.length) {
    bridgeQueries.push(
      admin.from('faelle_claim_bridge').select(SELECT).in('claim_id', openClaimIds).in('claims.geschaedigter_user_id', kundeIds),
    )
  }
  if (fallIdsFromLeads.length) {
    bridgeQueries.push(
      admin.from('faelle_claim_bridge').select(SELECT).in('claim_id', openClaimIds).in('fall_id', fallIdsFromLeads),
    )
  }
  const bridgeResults = await Promise.all(bridgeQueries)
  const seenFallIds = new Set<string>()
  const offeneFaelleRaw: Array<Record<string, unknown>> = []
  for (const res of bridgeResults) {
    for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
      const fid = row.fall_id as string
      if (seenFallIds.has(fid)) continue
      seenFallIds.add(fid)
      offeneFaelleRaw.push(row)
    }
  }

  if (!offeneFaelleRaw || offeneFaelleRaw.length === 0) {
    return { fallId: null, leadId: leads[0]?.id ?? null, multipleCandidates: false, candidates: [] }
  }

  // CMM-65: claims.created_at + claim_nummer flachziehen und clientseitig nach
  // created_at DESC sortieren (aktuellster offener Fall = candidates[0]).
  type ClaimEmbed = {
    claim_nummer: string | null
    operative_status: string | null
    created_at: string | null
    geschaedigter_user_id: string | null
    vehicle_id: string | null
    vehicles: VehEmbed | VehEmbed[] | null
  }
  type VehEmbed = { kennzeichen_aktuell: string | null; hersteller: string | null; modell_haupttyp: string | null }
  const candidates: MatchedFall[] = offeneFaelleRaw
    .map((f) => {
      const claim = (Array.isArray(f.claims) ? f.claims[0] : f.claims) as ClaimEmbed | null
      const veh = (Array.isArray(claim?.vehicles) ? claim?.vehicles[0] : claim?.vehicles) as VehEmbed | null | undefined
      return {
        id: f.fall_id as string,
        claim_nummer: claim?.claim_nummer ?? null,
        // CMM-74 b″: status aus claims.operative_status (SSoT, 1:1-Mirror von faelle.status).
        status: claim?.operative_status ?? null,
        // CMM-50/CMM-49: Fahrzeug aus vehicles (claims.vehicle_id); faelle-Snapshot war 0-populated.
        kennzeichen: veh?.kennzeichen_aktuell ?? null,
        fahrzeug_hersteller: veh?.hersteller ?? null,
        fahrzeug_modell: veh?.modell_haupttyp ?? null,
        kunde_id: claim?.geschaedigter_user_id ?? null,
        created_at: claim?.created_at ?? '',
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    fallId: candidates[0].id,
    leadId: leads[0]?.id ?? null,
    multipleCandidates: candidates.length > 1,
    candidates,
  }
}
