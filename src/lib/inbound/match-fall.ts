// AAR-103: Match Inbound-Call/Message to the right Fall bei Multi-Fall-Kunden.
// Liefert den aktuellsten offenen Fall + Liste aller Kandidaten fuer manuelles Switching.

import type { createAdminClient } from '@/lib/supabase/admin'

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

const CLOSED_STATUSES = ['abgeschlossen', 'storniert']

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

  // Lead-Match + Kunden-Match parallel
  const [leadsRes, kundenRes] = await Promise.all([
    admin
      .from('leads')
      .select('id, konvertiert_zu_fall_id')
      .ilike('telefon', `%${suffix}%`)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'kunde')
      .ilike('telefon', `%${suffix}%`)
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

  // Alle offenen Faelle finden (IN-List funktioniert auch mit leerem Array dank OR)
  const orParts: string[] = []
  if (kundeIds.length) orParts.push(`kunde_id.in.(${kundeIds.join(',')})`)
  if (fallIdsFromLeads.length) orParts.push(`id.in.(${fallIdsFromLeads.join(',')})`)

  // CMM-65: created_at lebt auf claims (SSoT). claim_id NOT NULL -> !inner verlustfrei.
  // supabase-js kann nicht nach eingebetteter to-one-Spalte ordnen -> Sortierung clientseitig.
  let query = admin
    .from('faelle')
    .select('id, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, kunde_id, claims:claim_id!inner(claim_nummer, created_at)')
    .not('status', 'in', `(${CLOSED_STATUSES.map(s => `"${s}"`).join(',')})`)

  if (orParts.length === 1) {
    // .or braucht das Format ohne Praefix
    const single = orParts[0]
    if (single.startsWith('kunde_id.in.')) {
      query = query.in('kunde_id', kundeIds)
    } else if (single.startsWith('id.in.')) {
      query = query.in('id', fallIdsFromLeads)
    }
  } else if (orParts.length > 1) {
    query = query.or(orParts.join(','))
  }

  const { data: offeneFaelleRaw } = await query

  if (!offeneFaelleRaw || offeneFaelleRaw.length === 0) {
    return { fallId: null, leadId: leads[0]?.id ?? null, multipleCandidates: false, candidates: [] }
  }

  // CMM-65: claims.created_at + claim_nummer flachziehen und clientseitig nach
  // created_at DESC sortieren (aktuellster offener Fall = candidates[0]).
  const candidates: MatchedFall[] = offeneFaelleRaw
    .map((f) => {
      const claim = Array.isArray(f.claims) ? f.claims[0] : f.claims
      return {
        id: f.id,
        claim_nummer: (claim?.claim_nummer as string | null) ?? null,
        status: f.status,
        kennzeichen: f.kennzeichen,
        fahrzeug_hersteller: f.fahrzeug_hersteller,
        fahrzeug_modell: f.fahrzeug_modell,
        kunde_id: f.kunde_id,
        created_at: (claim?.created_at as string | null) ?? '',
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
