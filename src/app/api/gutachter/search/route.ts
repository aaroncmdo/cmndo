// AAR-804: SV-Spotlight-Search-API.
// Search nur über die eigenen Fälle des SV (RLS-gefiltert auf sv_id =
// authenticated SV.id). Felder: fall_nummer, kennzeichen, schadenort_ort,
// kunde_name (gejoint über leads).
// CMM-44 SP-A2 (Cluster 1): schadenort_ort lebt auf claims (SSoT). PostgREST
// .or() kann nicht ueber Embeds filtern → die Schadenort-Suche laeuft als
// separater claims-Query (ilike auf schadenort_ort → claim-IDs → faelle.in),
// analog zum bereits bestehenden Kundenname-Such-Pattern. Verhalten bleibt:
// „Koeln" eintippen findet weiterhin den Fall.

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getGutachterForUser } from '@/lib/gutachter'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ faelle: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return NextResponse.json({ faelle: [] })

  const pattern = `%${q}%`

  // RLS deckt die Eigenfilterung auf sv_id ab; zur Sicherheit explizit eq.
  const { data } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, status, leads(vorname, nachname), claims:claim_id(schadenort_ort)')
    .eq('sv_id', sv.id)
    .or(`fall_nummer.ilike.${pattern},kennzeichen.ilike.${pattern}`)
    .limit(8)

  // Zusätzlich Kunden-Name-Suche (Join unterstützt ilike nicht direkt).
  const ql = q.toLowerCase()
  const { data: byName } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, status, leads(vorname, nachname), claims:claim_id(schadenort_ort)')
    .eq('sv_id', sv.id)
    .limit(40)

  const nameMatches = (byName ?? []).filter((f) => {
    const lead = (Array.isArray(f.leads) ? f.leads[0] : f.leads) as
      | { vorname: string | null; nachname: string | null }
      | null
    const name = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ').toLowerCase()
    return name.includes(ql)
  })

  // CMM-44 SP-A2: Schadenort-Suche — claims.schadenort_ort liegt im Embed,
  // .or() oben kann nicht darueber filtern. Separater claims-Query → claim-IDs,
  // dann faelle.in('claim_id', …) und ins selbe Merge-Set einspeisen.
  const { data: ortClaims } = await supabase
    .from('claims')
    .select('id')
    .ilike('schadenort_ort', pattern)
    .limit(40)
  const ortClaimIds = (ortClaims ?? []).map((c) => c.id as string)
  const { data: byOrt } = ortClaimIds.length
    ? await supabase
        .from('faelle')
        .select('id, fall_nummer, kennzeichen, status, leads(vorname, nachname), claims:claim_id(schadenort_ort)')
        .eq('sv_id', sv.id)
        .in('claim_id', ortClaimIds)
        .limit(8)
    : { data: [] as typeof data }

  // Merge by id, max 8 Treffer.
  const seen = new Set<string>()
  const merged: typeof data = []
  for (const f of [...(data ?? []), ...nameMatches, ...(byOrt ?? [])]) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    merged.push(f)
    if (merged.length >= 8) break
  }

  return NextResponse.json({
    faelle: merged.map((f) => {
      const lead = (Array.isArray(f.leads) ? f.leads[0] : f.leads) as
        | { vorname: string | null; nachname: string | null }
        | null
      const kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ')
      const claim = (Array.isArray(f.claims) ? f.claims[0] : f.claims) as
        | { schadenort_ort: string | null }
        | null
      return {
        id: f.id,
        label: f.kennzeichen || f.fall_nummer || f.id.slice(0, 8),
        sub: [kundeName, claim?.schadenort_ort].filter(Boolean).join(' · '),
        status: f.status,
      }
    }),
  })
}
