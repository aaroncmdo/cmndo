import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ faelle: [], leads: [], sv: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const pattern = `%${q}%`

  const FAELLE_SELECT =
    'id, mandatsnummer, status, kennzeichen, lead_id, claims:claim_id(claim_nummer, schadenort_ort)'

  const [faelleRes, leadsRes, svRes, ortClaimsRes, nrClaimsRes] = await Promise.all([
    // CMM-44 SP-A2/A3 (Cluster 1): schadenort_ort und claim_nummer leben auf claims
    // (SSoT) — als Embed fuer die Anzeige geladen. PostgREST .or() kann nicht ueber
    // Embeds filtern; Schadenort- und Aktennummer-Suche laufen separat (unten).
    supabase
      .from('faelle')
      .select(FAELLE_SELECT)
      .or(`mandatsnummer.ilike.${pattern},kennzeichen.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('leads')
      .select('id, vorname, nachname, telefon, email, schadens_fall_typ, qualifizierungs_phase')
      .or(`vorname.ilike.${pattern},nachname.ilike.${pattern},telefon.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('sachverstaendige')
      .select('id, standort_adresse, gutachter_typ, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email)')
      .limit(5),
    // CMM-44 SP-A2: Schadenort-Suche via separatem claims-Query (ilike auf
    // schadenort_ort → claim-IDs), danach faelle.in('claim_id', …).
    supabase
      .from('claims')
      .select('id')
      .ilike('schadenort_ort', pattern)
      .limit(5),
    // CMM-44 SP-A3: Aktennummer-Suche analog — ilike auf claims.claim_nummer.
    supabase
      .from('claims')
      .select('id')
      .ilike('claim_nummer', pattern)
      .limit(5),
  ])

  const matchClaimIds = Array.from(new Set([
    ...(ortClaimsRes.data ?? []).map(c => c.id as string),
    ...(nrClaimsRes.data ?? []).map(c => c.id as string),
  ]))
  const { data: claimFaelle } = matchClaimIds.length
    ? await supabase.from('faelle').select(FAELLE_SELECT).in('claim_id', matchClaimIds).limit(10)
    : { data: [] as NonNullable<typeof faelleRes.data> }

  // Fall-Treffer aus Nummer/Kennzeichen + Schadenort + Aktennummer mergen + dedupen.
  const faelleSeen = new Set<string>()
  const faelleMerged: NonNullable<typeof faelleRes.data> = []
  for (const f of [...(faelleRes.data ?? []), ...(claimFaelle ?? [])]) {
    if (faelleSeen.has(f.id as string)) continue
    faelleSeen.add(f.id as string)
    faelleMerged.push(f)
    if (faelleMerged.length >= 5) break
  }

  // Filter SV client-side (join doesn't support ilike on joined table easily)
  const svFiltered = (svRes.data ?? []).filter(sv => {
    const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null; email: string | null } | null
    const name = [p?.vorname, p?.nachname].filter(Boolean).join(' ').toLowerCase()
    const ql = q.toLowerCase()
    return name.includes(ql) || (p?.email ?? '').toLowerCase().includes(ql) || (sv.standort_adresse ?? '').toLowerCase().includes(ql)
  }).slice(0, 5)

  return NextResponse.json({
    faelle: faelleMerged.map(f => {
      const claim = (Array.isArray(f.claims) ? f.claims[0] : f.claims) as
        | { claim_nummer: string | null; schadenort_ort: string | null }
        | null
      return {
        id: f.id,
        label: (f as Record<string, unknown>).mandatsnummer ?? claim?.claim_nummer ?? f.id.slice(0, 8),
        sub: [f.kennzeichen, claim?.schadenort_ort].filter(Boolean).join(' · '),
        status: f.status,
      }
    }),
    leads: (leadsRes.data ?? []).map(l => ({
      id: l.id,
      label: [l.vorname, l.nachname].filter(Boolean).join(' ') || l.email || l.id.slice(0, 8),
      sub: [l.telefon, l.schadens_fall_typ].filter(Boolean).join(' · '),
      status: l.qualifizierungs_phase,
    })),
    sv: svFiltered.map(sv => {
      const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null; email: string | null } | null
      return {
        id: sv.id,
        label: [p?.vorname, p?.nachname].filter(Boolean).join(' ') || sv.id.slice(0, 8),
        sub: sv.standort_adresse ?? sv.gutachter_typ ?? '',
      }
    }),
  })
}
