import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type FallLookupResult = {
  fallId: string
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

  // Suche nach Fällen mit Kunden-Namen (über leads join) oder Aktennummer.
  // CMM-44 SP-A3: Aktennummer ist claims.claim_nummer (nested über claim_id).
  const { data: byFallNr } = await supabase
    .from('faelle')
    .select('id, lead_id, claims:claim_id(claim_nummer)')
    .ilike('claims.claim_nummer', pattern)
    .not('claims', 'is', null)
    .not('status', 'eq', 'storniert')
    .limit(5)

  const { data: byName } = await supabase
    .from('leads')
    .select('id, vorname, nachname')
    .or(`vorname.ilike.${pattern},nachname.ilike.${pattern}`)
    .limit(10)

  const leadIdsByName = new Set((byName ?? []).map((l) => l.id))

  let { data: byLead } = leadIdsByName.size > 0
    ? await supabase
        .from('faelle')
        .select('id, lead_id, claims:claim_id(claim_nummer)')
        .in('lead_id', [...leadIdsByName])
        .not('status', 'eq', 'storniert')
        .limit(10)
    : { data: [] as Array<{ id: string; lead_id: string | null; claims: { claim_nummer: string | null } | { claim_nummer: string | null }[] | null }> }

  byLead = byLead ?? []

  // Alle unique lead_ids auflösen
  const allFaelle = [
    ...(byFallNr ?? []),
    ...byLead.filter((f) => !(byFallNr ?? []).some((x) => x.id === f.id)),
  ].slice(0, 8)

  const leadIds = [...new Set(allFaelle.map((f) => f.lead_id).filter(Boolean) as string[])]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> }

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]))

  const results: FallLookupResult[] = allFaelle.map((f) => {
    const lead = f.lead_id ? leadMap.get(f.lead_id) : null
    const kundeName = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      : 'Unbekannt'
    const claim = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return { fallId: f.id, fallNummer: claim?.claim_nummer ?? null, kundeName: kundeName || 'Unbekannt' }
  })

  return NextResponse.json({ results })
}
