import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import StatistikenClient from './StatistikenClient'

// KFZ-153: Statistik-Tab Rework — 4 Sektionen + rollenbasierte Sichtbarkeit.

export type UserStatistikRolle =
  | 'admin'
  | 'kundenbetreuer'
  | 'leadbearbeiter'
  | 'sv_solo'
  | 'sv_buero_inhaber'
  | 'sv_sub_buero'
  | 'akademie_verwalter'
  | 'akademie_sub_sv'
  | 'community_member'

export type StatistikFall = {
  id: string
  status: string
  sv_id: string | null
  created_at: string
  regulierung_am: string | null
  regulierung_betrag: number | null
  gutachten_betrag: number | null
  gutachten_eingegangen_am: string | null
  sv_zugewiesen_am: string | null
  schadens_ursache: string | null
  schadens_plz: string | null
  kundenbetreuer_id: string | null
  unfall_konstellation: string | null
  gegner_anzahl_beteiligte: number | null
  gegner_fahrzeugtyp: string | null
  organisation_id: string | null
  fahrzeug_typ: string | null
  leadbearbeiter_id: string | null
  lead_id: string | null
}

export type StatistikKlassifizierung = {
  id: string
  fall_id: string
  regulierungs_status: string
  kuerzungsgrund: string | null
  kuerzung_betrag_netto: number | null
  reguliert_betrag_netto: number | null
  geltend_gemacht_netto: number | null
  versicherer: string | null
  erfasst_am: string
}

export type Benchmark = {
  metrik: string
  beschreibung: string
  branchen_wert: number
  einheit: string
  quelle: string | null
}

async function getUserStatistikRolle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ rolle: UserStatistikRolle; svId: string | null; orgId: string | null; subSvIds: string[] }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', userId)
    .single()

  const rolle = profile?.rolle as string

  if (rolle === 'admin') return { rolle: 'admin', svId: null, orgId: null, subSvIds: [] }
  if (rolle === 'kundenbetreuer') return { rolle: 'kundenbetreuer', svId: null, orgId: null, subSvIds: [] }
  if (rolle === 'leadbearbeiter') return { rolle: 'leadbearbeiter', svId: null, orgId: null, subSvIds: [] }

  // Check if user is an SV
  const sv = await getGutachterForUser<{
    id: string
    organisation_id: string | null
    rolle_in_organisation: string | null
  }>(supabase, userId, 'id, organisation_id, rolle_in_organisation')

  if (!sv) return { rolle: 'admin', svId: null, orgId: null, subSvIds: [] } // fallback

  const svId = sv.id
  const orgId = sv.organisation_id

  if (!orgId) return { rolle: 'sv_solo', svId, orgId: null, subSvIds: [] }

  // Check org type
  const adminClient = createAdminClient()
  const { data: org } = await adminClient
    .from('organisationen')
    .select('typ')
    .eq('id', orgId)
    .single()

  const orgTyp = org?.typ as string

  if (sv.rolle_in_organisation === 'community_member') {
    return { rolle: 'community_member', svId, orgId, subSvIds: [] }
  }

  if (orgTyp === 'akademie') {
    if (sv.rolle_in_organisation === 'inhaber') {
      // Get sub SVs
      const { data: subSvs } = await adminClient
        .from('sachverstaendige')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('ist_aktiv', true)
      return { rolle: 'akademie_verwalter', svId, orgId, subSvIds: (subSvs ?? []).map(s => s.id) }
    }
    return { rolle: 'akademie_sub_sv', svId, orgId, subSvIds: [] }
  }

  // Büro
  if (sv.rolle_in_organisation === 'inhaber') {
    const { data: subSvs } = await adminClient
      .from('sachverstaendige')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('ist_aktiv', true)
    return { rolle: 'sv_buero_inhaber', svId, orgId, subSvIds: (subSvs ?? []).map(s => s.id) }
  }

  return { rolle: 'sv_sub_buero', svId, orgId, subSvIds: [] }
}

export default async function StatistikenPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { rolle, svId, orgId, subSvIds } = await getUserStatistikRolle(supabase, user.id)

  // Build SV filter based on role
  let svFilter: string[] | null = null // null = all
  if (rolle === 'sv_solo' || rolle === 'sv_sub_buero' || rolle === 'akademie_sub_sv') {
    svFilter = svId ? [svId] : []
  } else if (rolle === 'sv_buero_inhaber' || rolle === 'akademie_verwalter') {
    svFilter = subSvIds
  } else if (rolle === 'community_member') {
    svFilter = svId ? [svId] : []
  }

  // Fetch faelle
  let faelleQuery = adminClient
    .from('faelle')
    .select('id, status, sv_id, created_at, regulierung_am, regulierung_betrag, gutachten_betrag, gutachten_eingegangen_am, sv_zugewiesen_am, schadens_ursache, schadens_plz, kundenbetreuer_id, unfall_konstellation, gegner_anzahl_beteiligte, gegner_fahrzeugtyp, organisation_id, fahrzeug_typ, leadbearbeiter_id, lead_id')
    .order('created_at', { ascending: false })

  if (rolle === 'kundenbetreuer') {
    // Default: eigene Fälle. Toggle handled client-side (allFaelle prop passed too).
    // We'll fetch all and let client filter.
  } else if (svFilter) {
    faelleQuery = faelleQuery.in('sv_id', svFilter)
  }

  const [
    { data: faelle },
    { data: klassifizierungen },
    { data: benchmarks },
    { data: svList },
  ] = await Promise.all([
    faelleQuery,
    adminClient
      .from('regulierungs_klassifizierung')
      .select('id, fall_id, regulierungs_status, kuerzungsgrund, kuerzung_betrag_netto, reguliert_betrag_netto, geltend_gemacht_netto, versicherer, erfasst_am')
      .order('erfasst_am', { ascending: false }),
    adminClient
      .from('branchen_benchmarks')
      .select('metrik, beschreibung, branchen_wert, einheit, quelle'),
    adminClient
      .from('sachverstaendige')
      .select('id, profiles(vorname, nachname)')
      .eq('ist_aktiv', true),
  ])

  // Build SV name map
  const svNameMap: Record<string, string> = {}
  for (const sv of svList ?? []) {
    const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as {
      vorname: string | null
      nachname: string | null
    } | null
    svNameMap[sv.id] = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—' : '—'
  }

  // Leads count for Konversionsquote benchmark
  const { count: leadsCount } = await adminClient
    .from('leads')
    .select('id', { count: 'exact', head: true })

  // Community leaderboard data if needed
  let leaderboard: { sv_id: string; faelle_count: number; umsatz_netto: number; rang: number }[] = []
  if (rolle === 'community_member' && orgId) {
    const { data: lb } = await adminClient
      .from('community_leaderboard')
      .select('sv_id, faelle_count, umsatz_netto, rang')
      .eq('organisation_id', orgId)
      .order('rang', { ascending: true })
    leaderboard = lb ?? []
  }

  return (
    <StatistikenClient
      faelle={(faelle ?? []) as StatistikFall[]}
      klassifizierungen={(klassifizierungen ?? []) as StatistikKlassifizierung[]}
      benchmarks={(benchmarks ?? []) as Benchmark[]}
      svNameMap={svNameMap}
      rolle={rolle}
      userId={user.id}
      leaderboard={leaderboard}
      totalLeads={leadsCount ?? 0}
    />
  )
}
