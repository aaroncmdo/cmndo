// AAR-122: Karte als Hub für Geo-Ressourcen (SVs + Communities + Organisationen).
// Ersetzt die vorherige Redirect-Page. Koordinaten für Communities/Orgs werden
// vom Standort ihres Hauptansprechpartners/ersten SV-Members abgeleitet
// (da organisationen keine eigenen lat/lng-Spalten hat — Follow-up-Migration).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KarteHubClient, { type SvMarker, type CommunityMarker, type OrgMarker } from './KarteHubClient'

export const dynamic = 'force-dynamic'

export default async function KartePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // SVs mit Standort
  const { data: svRaw } = await supabase
    .from('sachverstaendige')
    .select('id, paket, standort_lat, standort_lng, ist_aktiv, organisation_id, profiles(vorname, nachname)')
    .is('geloescht_am', null)

  type SvRow = {
    id: string
    paket: string | null
    standort_lat: number | null
    standort_lng: number | null
    ist_aktiv: boolean
    organisation_id: string | null
    profiles: { vorname: string | null; nachname: string | null } | null
  }
  const svRows = (svRaw ?? []) as unknown as SvRow[]

  const svs: SvMarker[] = svRows.map((sv) => ({
    id: sv.id,
    name: sv.profiles ? `${sv.profiles.vorname ?? ''} ${sv.profiles.nachname ?? ''}`.trim() : 'Unbekannt',
    paket: sv.paket,
    lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
    lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
    istAktiv: sv.ist_aktiv !== false,
  }))

  // Organisationen (Communities + Büros + Akademien)
  const { data: orgRaw } = await supabase
    .from('organisationen')
    .select('id, name, typ, community_exklusiv, community_max_faelle_monat')

  type OrgRow = {
    id: string
    name: string
    typ: 'community' | 'buero' | 'akademie' | string
    community_exklusiv: boolean | null
    community_max_faelle_monat: number | null
  }
  const orgRows = (orgRaw ?? []) as unknown as OrgRow[]

  // Lat/Lng-Lookup pro Org via ersten SV-Member mit Standort
  const orgToSv = new Map<string, SvRow>()
  for (const sv of svRows) {
    if (!sv.organisation_id) continue
    if (sv.standort_lat == null || sv.standort_lng == null) continue
    if (!orgToSv.has(sv.organisation_id)) orgToSv.set(sv.organisation_id, sv)
  }

  const communities: CommunityMarker[] = orgRows
    .filter((o) => o.typ === 'community')
    .map((o) => {
      const svMember = orgToSv.get(o.id)
      return {
        id: o.id,
        name: o.name,
        exklusiv: !!o.community_exklusiv,
        maxFaelle: o.community_max_faelle_monat,
        lat: svMember?.standort_lat != null ? Number(svMember.standort_lat) : null,
        lng: svMember?.standort_lng != null ? Number(svMember.standort_lng) : null,
      }
    })

  const organisationen: OrgMarker[] = orgRows
    .filter((o) => o.typ === 'buero' || o.typ === 'akademie')
    .map((o) => {
      const svMember = orgToSv.get(o.id)
      return {
        id: o.id,
        name: o.name,
        typ: o.typ as 'buero' | 'akademie',
        lat: svMember?.standort_lat != null ? Number(svMember.standort_lat) : null,
        lng: svMember?.standort_lng != null ? Number(svMember.standort_lng) : null,
      }
    })

  return (
    <div className="py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Karte</h1>
      <KarteHubClient svs={svs} communities={communities} organisationen={organisationen} />
    </div>
  )
}
