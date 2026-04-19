import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ faelle: [], leads: [], sv: [] })

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const pattern = `%${q}%`

  const [faelleRes, leadsRes, svRes] = await Promise.all([
    supabase
      .from('faelle')
      .select('id, fall_nummer, mandatsnummer, status, kennzeichen, schadens_ort, lead_id')
      .or(`fall_nummer.ilike.${pattern},mandatsnummer.ilike.${pattern},kennzeichen.ilike.${pattern},schadens_ort.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('leads')
      .select('id, vorname, nachname, telefon, email, schadens_fall_typ, qualifizierungs_phase')
      .or(`vorname.ilike.${pattern},nachname.ilike.${pattern},telefon.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('sachverstaendige')
      .select('id, standort_adresse, gutachter_typ, profiles(vorname, nachname, email)')
      .limit(5),
  ])

  // Filter SV client-side (join doesn't support ilike on joined table easily)
  const svFiltered = (svRes.data ?? []).filter(sv => {
    const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null; email: string | null } | null
    const name = [p?.vorname, p?.nachname].filter(Boolean).join(' ').toLowerCase()
    const ql = q.toLowerCase()
    return name.includes(ql) || (p?.email ?? '').toLowerCase().includes(ql) || (sv.standort_adresse ?? '').toLowerCase().includes(ql)
  }).slice(0, 5)

  return NextResponse.json({
    faelle: (faelleRes.data ?? []).map(f => ({
      id: f.id,
      label: (f as Record<string, unknown>).mandatsnummer ?? f.fall_nummer ?? f.id.slice(0, 8),
      sub: [f.kennzeichen, f.schadens_ort].filter(Boolean).join(' · '),
      status: f.status,
    })),
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
