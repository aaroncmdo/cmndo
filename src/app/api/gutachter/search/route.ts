// AAR-804: SV-Spotlight-Search-API.
// Search nur über die eigenen Fälle des SV (RLS-gefiltert auf sv_id =
// authenticated SV.id). Felder: claim_nummer (Aktennummer), kennzeichen,
// schadenort_ort, kunde_name (gejoint über leads).
// CMM-44 SP-A3: Aktennummer lebt auf claims.claim_nummer (SSoT). .or() kann
// nicht über Embeds filtern → die Aktennummer-Suche läuft als separater
// claims-Query, analog zur Schadenort-Suche unten.
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
  const ql = q.toLowerCase()

  // CMM-49: faelle->v_claim_full (claim-anchored SSoT). kennzeichen/operative_status/
  // claim_nummer/schadenort_ort flach aus der View; lead-Namen via lead_id de-embedded
  // (leads-Embed gibt es auf der View nicht) -> eine gemeinsame leads-Query unten.
  const VIEW_COLS = 'id:fall_id, kennzeichen, operative_status, lead_id, claim_nummer, schadenort_ort'
  type SearchRow = {
    id: string | null
    kennzeichen: string | null
    operative_status: string | null
    lead_id: string | null
    claim_nummer: string | null
    schadenort_ort: string | null
  }

  // RLS deckt die Eigenfilterung auf sv_id ab; zur Sicherheit explizit eq.
  const { data: byKennz } = await supabase
    .from('v_claim_full')
    .select(VIEW_COLS)
    .eq('sv_id', sv.id)
    .not('fall_id', 'is', null)
    .ilike('kennzeichen', pattern)
    .limit(8)

  // Kunden-Name-Suche (leads-Join unterstuetzt ilike nicht direkt) -> 40 laden, clientseitig filtern.
  const { data: byNameRaw } = await supabase
    .from('v_claim_full')
    .select(VIEW_COLS)
    .eq('sv_id', sv.id)
    .not('fall_id', 'is', null)
    .limit(40)

  // CMM-44 SP-A2/A3: Schadenort- und Aktennummer-Suche — schadenort_ort und
  // claim_nummer liegen auf claims. Separate claims-Querys → claim-IDs, dann
  // v_claim_full.in('id', …) (View-id == claims.id) ins selbe Merge-Set.
  const { data: ortClaims } = await supabase
    .from('claims')
    .select('id')
    .ilike('schadenort_ort', pattern)
    .limit(40)
  const { data: nrClaims } = await supabase
    .from('claims')
    .select('id')
    .ilike('claim_nummer', pattern)
    .limit(40)
  const matchClaimIds = Array.from(new Set([
    ...(ortClaims ?? []).map((c) => c.id as string),
    ...(nrClaims ?? []).map((c) => c.id as string),
  ]))
  const { data: byClaim } = matchClaimIds.length
    ? await supabase
        .from('v_claim_full')
        .select(VIEW_COLS)
        .eq('sv_id', sv.id)
        .not('fall_id', 'is', null)
        .in('id', matchClaimIds)
        .limit(16)
    : { data: [] as SearchRow[] }

  // lead-Namen de-embedded: alle lead_ids der 3 Sets -> eine leads-Query.
  const allRows = [
    ...((byKennz ?? []) as SearchRow[]),
    ...((byNameRaw ?? []) as SearchRow[]),
    ...((byClaim ?? []) as SearchRow[]),
  ]
  const leadIds = Array.from(new Set(allRows.map((r) => r.lead_id).filter(Boolean) as string[]))
  const leadMap = new Map<string, { vorname: string | null; nachname: string | null }>()
  if (leadIds.length) {
    const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    for (const l of (leads ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null }>) {
      leadMap.set(l.id, { vorname: l.vorname, nachname: l.nachname })
    }
  }
  const leadName = (leadId: string | null): string => {
    const lead = leadId ? leadMap.get(leadId) ?? null : null
    return [lead?.vorname, lead?.nachname].filter(Boolean).join(' ')
  }

  const nameMatches = ((byNameRaw ?? []) as SearchRow[]).filter((f) =>
    leadName(f.lead_id).toLowerCase().includes(ql),
  )

  // Merge by id, max 8 Treffer.
  const seen = new Set<string>()
  const merged: SearchRow[] = []
  for (const f of [...((byKennz ?? []) as SearchRow[]), ...nameMatches, ...((byClaim ?? []) as SearchRow[])]) {
    if (!f.id || seen.has(f.id)) continue
    seen.add(f.id)
    merged.push(f)
    if (merged.length >= 8) break
  }

  return NextResponse.json({
    faelle: merged.map((f) => ({
      id: f.id,
      label: f.kennzeichen || f.claim_nummer || (f.id ?? '').slice(0, 8),
      sub: [leadName(f.lead_id), f.schadenort_ort].filter(Boolean).join(' · '),
      // CMM-74 b″: status aus claims.operative_status (SSoT; == faelle.status, 0-diff).
      status: f.operative_status,
    })),
  })
}
