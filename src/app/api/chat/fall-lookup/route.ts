import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type FallLookupResult = {
  fallId: string
  fallNummer: string | null
  kundeName: string
}

// Schnelle Fall-Suche für "Neuer Chat" im Posteingang-FAB.
// Sucht faelle + leads nach name oder fall_nummer.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })

  const pattern = `%${q}%`

  // Suche nach Fällen mit Kunden-Namen (über leads join) oder Fall-Nummer
  const { data: byFallNr } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id')
    .ilike('fall_nummer', pattern)
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
        .select('id, fall_nummer, lead_id')
        .in('lead_id', [...leadIdsByName])
        .not('status', 'eq', 'storniert')
        .limit(10)
    : { data: [] as Array<{ id: string; fall_nummer: string | null; lead_id: string | null }> }

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
    return { fallId: f.id, fallNummer: f.fall_nummer, kundeName: kundeName || 'Unbekannt' }
  })

  return NextResponse.json({ results })
}
