import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ faelle: [], leads: [], sv: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const pattern = `%${q}%`

  // CMM-49 faelle-DROP: die Fall-Suche ist jetzt komplett claims-nativ (faelle-frei). Match-Quellen
  // sind alle kanonisch — claims.claim_nummer / claims.schadenort_ort, vehicles.kennzeichen_aktuell,
  // kanzlei_faelle.mandatsnummer — und liefern claim_ids. Die Anzeige-Daten (inkl. fall_id via Bridge
  // in der View, kennzeichen aus vehicles, status aus operative_status) kommen aus v_claim_full, das
  // RLS-gated ist (nur Claims des Users surfacen) und damit die Sichtbarkeits-Grenze der frueheren
  // faelle-RLS spiegelt. Die alten faelle.{mandatsnummer,kennzeichen,status}-Reads (Legacy/reader-frei,
  // fuer neue Faelle eh null) entfallen — die Suche wird dadurch fuer neue Faelle eher praeziser.
  const [leadsRes, svRes, nrClaimsRes, ortClaimsRes, vehKzRes, mandatKfRes] = await Promise.all([
    supabase
      .from('leads')
      .select('id, vorname, nachname, telefon, email, schadens_fall_typ, qualifizierungs_phase')
      .or(`vorname.ilike.${pattern},nachname.ilike.${pattern},telefon.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('sachverstaendige')
      .select('id, standort_adresse, gutachter_typ, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email)')
      .limit(5),
    // Aktennummer (claims.claim_nummer) + Schadenort (claims.schadenort_ort) — schon claims-nativ.
    supabase.from('claims').select('id').ilike('claim_nummer', pattern).limit(5),
    supabase.from('claims').select('id').ilike('schadenort_ort', pattern).limit(5),
    // Kennzeichen lebt auf vehicles (kennzeichen_aktuell); die claims.in(vehicle_id)-Query unten gatet RLS.
    supabase.from('vehicles').select('id').ilike('kennzeichen_aktuell', pattern).limit(10),
    // Mandatsnummer lebt auf kanzlei_faelle (1:1 pro Claim) — ersetzt die alte faelle.mandatsnummer-Suche.
    supabase.from('kanzlei_faelle').select('claim_id').ilike('mandatsnummer', pattern).limit(5),
  ])

  // Kennzeichen-Treffer aus vehicles -> claims (RLS-Gate: nur Claims des Users).
  const vehicleIds = (vehKzRes.data ?? []).map(v => v.id as string)
  const { data: vehClaims } = vehicleIds.length
    ? await supabase.from('claims').select('id').in('vehicle_id', vehicleIds).limit(10)
    : { data: [] as { id: string }[] }

  const matchClaimIds = Array.from(new Set([
    ...(nrClaimsRes.data ?? []).map(c => c.id as string),
    ...(ortClaimsRes.data ?? []).map(c => c.id as string),
    ...(vehClaims ?? []).map(c => c.id as string),
    ...(mandatKfRes.data ?? []).map(k => k.claim_id as string | null).filter((x): x is string => !!x),
  ]))

  // Anzeige-Daten aus v_claim_full (RLS-gated; fall_id kommt via Bridge aus der View).
  const { data: claimRows } = matchClaimIds.length
    ? await supabase
        .from('v_claim_full')
        .select('id, fall_id, claim_nummer, kennzeichen, schadens_ort, mandatsnummer, fall_status')
        .in('id', matchClaimIds)
        .limit(5)
    : {
        data: [] as Array<{
          id: string
          fall_id: string | null
          claim_nummer: string | null
          kennzeichen: string | null
          schadens_ort: string | null
          mandatsnummer: string | null
          fall_status: string | null
        }>,
      }

  // SV client-seitig filtern (der join unterstuetzt kein ilike auf der joined Tabelle).
  const svFiltered = (svRes.data ?? []).filter(sv => {
    const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null; email: string | null } | null
    const name = [p?.vorname, p?.nachname].filter(Boolean).join(' ').toLowerCase()
    const ql = q.toLowerCase()
    return name.includes(ql) || (p?.email ?? '').toLowerCase().includes(ql) || (sv.standort_adresse ?? '').toLowerCase().includes(ql)
  }).slice(0, 5)

  return NextResponse.json({
    faelle: (claimRows ?? []).map(c => {
      // id = fall_id (Navigation auf die Fallakte wie bisher); Fallback claim_id fuer die wenigen
      // claims-nativen Faelle ohne Bridge-Row (Genesis-eingefroren: 2 von 84).
      const navId = (c.fall_id as string | null) ?? (c.id as string)
      return {
        id: navId,
        label: (c.claim_nummer as string | null) ?? navId.slice(0, 8),
        sub: [c.mandatsnummer, c.kennzeichen, c.schadens_ort].filter(Boolean).join(' · '),
        status: c.fall_status,
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
