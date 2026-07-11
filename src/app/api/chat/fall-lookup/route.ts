import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type FallLookupResult = {
  fallId: string
  // claim-nativ (Phase 2b): "Neuer Chat" pinnt claim-nativ, damit das Fenster den v2-Thread findet.
  claimId: string
  fallNummer: string | null
  kundeName: string
}

// Schnelle Fall-Suche für "Neuer Chat" im Posteingang-FAB.
// Sucht faelle + leads nach name oder Aktennummer (claims.claim_nummer).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })

  const pattern = `%${q}%`

  // CMM-74 b": Status-Filter claims-zentrisch (operative_status SSoT). Zwei-Schritt:
  // erst claims.operative_status filtern -> claim-IDs -> bridge.in('claim_id', …).
  // Eine gemeinsame Pre-Query für beide Bridge-Querys (byFallNr + byLead).
  const { data: nichtStornierteClaims } = await supabase
    .from('claims')
    .select('id')
    .not('operative_status', 'eq', 'storniert')
  const nichtStornierteClaimIds = (nichtStornierteClaims ?? []).map((c) => c.id as string)

  // Suche nach Fällen mit Kunden-Namen (über leads join) oder Aktennummer.
  // CMM-44 SP-A3: Aktennummer ist claims.claim_nummer (nested über claim_id).
  // CMM-49 (faelle-Drop-Runway): Anchor faelle_claim_bridge + claims!inner (fall_id==faelle.id;
  // claim_nummer/lead_id aus claims SSoT, div=0). !inner ersetzt .not('claims','is',null). RLS:
  // faelle_claim_bridge spiegelt faelle-Case-Access -> gleiche Sicht. Value-neutral (SET EQUAL probed).
  const { data: byFallNr } = await supabase
    .from('faelle_claim_bridge')
    .select('fall_id, claim_id, claims:claim_id!inner(claim_nummer, lead_id)')
    .ilike('claims.claim_nummer', pattern)
    .in('claim_id', nichtStornierteClaimIds)
    .limit(5)

  const { data: byName } = await supabase
    .from('leads')
    .select('id, vorname, nachname')
    .or(`vorname.ilike.${pattern},nachname.ilike.${pattern}`)
    .limit(10)

  const leadIdsByName = new Set((byName ?? []).map((l) => l.id))

  // CMM-49: lead_id-Filter -> claims.lead_id (embedded, SSoT div=0); !inner.
  const { data: byLeadRaw } = leadIdsByName.size > 0
    ? await supabase
        .from('faelle_claim_bridge')
        .select('fall_id, claim_id, claims:claim_id!inner(claim_nummer, lead_id)')
        .in('claims.lead_id', [...leadIdsByName])
        .in('claim_id', nichtStornierteClaimIds)
        .limit(10)
    : { data: [] }

  // CMM-49: Bridge-Rows -> {fallId, fallNummer, leadId} normalisieren (claims je Cardinality
  // Array-oder-Objekt), dann dedupe nach fall_id.
  type BridgeRow = { fall_id: string; claim_id: string; claims: { claim_nummer: string | null; lead_id: string | null } | { claim_nummer: string | null; lead_id: string | null }[] | null }
  const normalize = (rows: unknown): Array<{ fallId: string; claimId: string; fallNummer: string | null; leadId: string | null }> =>
    ((rows as BridgeRow[] | null) ?? []).map((r) => {
      const c = Array.isArray(r.claims) ? r.claims[0] : r.claims
      return { fallId: r.fall_id, claimId: r.claim_id, fallNummer: c?.claim_nummer ?? null, leadId: c?.lead_id ?? null }
    })
  const byFallNrN = normalize(byFallNr)
  const byLeadN = normalize(byLeadRaw)

  // Alle unique lead_ids auflösen
  const allFaelle = [
    ...byFallNrN,
    ...byLeadN.filter((f) => !byFallNrN.some((x) => x.fallId === f.fallId)),
  ].slice(0, 8)

  const leadIds = [...new Set(allFaelle.map((f) => f.leadId).filter(Boolean) as string[])]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> }

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]))

  const results: FallLookupResult[] = allFaelle.map((f) => {
    const lead = f.leadId ? leadMap.get(f.leadId) : null
    const kundeName = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      : 'Unbekannt'
    return { fallId: f.fallId, claimId: f.claimId, fallNummer: f.fallNummer, kundeName: kundeName || 'Unbekannt' }
  })

  return NextResponse.json({ results })
}
