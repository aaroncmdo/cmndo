// AAR-122: Karte als Hub für Geo-Ressourcen (SVs + Communities + Organisationen).
// AAR-129: Organisationen haben jetzt eigene Koordinaten — kein Hack mehr via
// Hauptansprechpartner/erster SV-Member. Für Altdaten ohne standort_lat/lng
// fällt der Lookup noch auf einen SV-Member zurück, bis das Backfill-Script
// (scripts/backfill-org-isochrones.mjs) gelaufen ist.
// AAR-130: Isochrone-Polygone werden für alle drei Layer geladen und im
// KarteHubClient als optionale Overlays angezeigt (Toggle "Einsatzgebiete").
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

  // SVs mit Standort + Isochrone (AAR-130)
  const { data: svRaw } = await supabase
    .from('sachverstaendige')
    .select('id, paket, standort_lat, standort_lng, ist_aktiv, organisation_id, isochrone_polygon, paket_umkreis_km, radius_km, profiles(vorname, nachname)')
    .is('geloescht_am', null)

  type SvRow = {
    id: string
    paket: string | null
    standort_lat: number | null
    standort_lng: number | null
    ist_aktiv: boolean
    organisation_id: string | null
    isochrone_polygon: unknown
    paket_umkreis_km: number | null
    radius_km: number | null
    profiles: unknown
  }
  const svRows = (svRaw ?? []) as unknown as SvRow[]

  const svs: SvMarker[] = svRows.map((sv) => {
    const pRel = sv.profiles
    const p = (Array.isArray(pRel) ? pRel[0] : pRel) as
      | { vorname: string | null; nachname: string | null }
      | null
    return {
      id: sv.id,
      name: p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : 'Unbekannt',
      paket: sv.paket,
      lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
      lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      istAktiv: sv.ist_aktiv !== false,
      isochrone: sv.isochrone_polygon as SvMarker['isochrone'] ?? null,
      einsatzKm: Number(sv.paket_umkreis_km) || Number(sv.radius_km) || null,
    }
  })

  // AAR-129: Organisationen mit eigenen Geo-Feldern laden
  // AAR-130: zusätzlich isochrone_polygon + einsatzgebiet_km für Overlays
  const { data: orgRaw } = await supabase
    .from('organisationen')
    .select('id, name, typ, community_exklusiv, community_max_faelle_monat, standort_lat, standort_lng, einsatzgebiet_zentrum_lat, einsatzgebiet_zentrum_lng, einsatzgebiet_km, einsatzgebiet_radius_km, isochrone_polygon')

  type OrgRow = {
    id: string
    name: string
    typ: 'community' | 'buero' | 'akademie' | string
    community_exklusiv: boolean | null
    community_max_faelle_monat: number | null
    standort_lat: number | null
    standort_lng: number | null
    // Legacy-Fallback bis Backfill gelaufen ist
    einsatzgebiet_zentrum_lat: number | null
    einsatzgebiet_zentrum_lng: number | null
    einsatzgebiet_km: number | null
    einsatzgebiet_radius_km: number | null
    isochrone_polygon: unknown
  }
  const orgRows = (orgRaw ?? []) as unknown as OrgRow[]

  // Legacy-Fallback: SV-Member-Standort für Alt-Orgs ohne eigene Koordinaten.
  // Wird nach dem Backfill nicht mehr benötigt.
  const orgToSv = new Map<string, SvRow>()
  for (const sv of svRows) {
    if (!sv.organisation_id) continue
    if (sv.standort_lat == null || sv.standort_lng == null) continue
    if (!orgToSv.has(sv.organisation_id)) orgToSv.set(sv.organisation_id, sv)
  }

  function resolveCoords(o: OrgRow): { lat: number | null; lng: number | null } {
    if (o.standort_lat != null && o.standort_lng != null) {
      return { lat: Number(o.standort_lat), lng: Number(o.standort_lng) }
    }
    if (o.einsatzgebiet_zentrum_lat != null && o.einsatzgebiet_zentrum_lng != null) {
      return { lat: Number(o.einsatzgebiet_zentrum_lat), lng: Number(o.einsatzgebiet_zentrum_lng) }
    }
    const svMember = orgToSv.get(o.id)
    return {
      lat: svMember?.standort_lat != null ? Number(svMember.standort_lat) : null,
      lng: svMember?.standort_lng != null ? Number(svMember.standort_lng) : null,
    }
  }

  const communities: CommunityMarker[] = orgRows
    .filter((o) => o.typ === 'community')
    .map((o) => {
      const { lat, lng } = resolveCoords(o)
      return {
        id: o.id,
        name: o.name,
        exklusiv: !!o.community_exklusiv,
        maxFaelle: o.community_max_faelle_monat,
        lat,
        lng,
        isochrone: o.isochrone_polygon as CommunityMarker['isochrone'] ?? null,
        einsatzKm: Number(o.einsatzgebiet_km) || Number(o.einsatzgebiet_radius_km) || null,
      }
    })

  const organisationen: OrgMarker[] = orgRows
    .filter((o) => o.typ === 'buero' || o.typ === 'akademie')
    .map((o) => {
      const { lat, lng } = resolveCoords(o)
      return {
        id: o.id,
        name: o.name,
        typ: o.typ as 'buero' | 'akademie',
        lat,
        lng,
        isochrone: o.isochrone_polygon as OrgMarker['isochrone'] ?? null,
        einsatzKm: Number(o.einsatzgebiet_km) || Number(o.einsatzgebiet_radius_km) || null,
      }
    })

  return (
    <div className="py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Karte</h1>
      <KarteHubClient svs={svs} communities={communities} organisationen={organisationen} />
    </div>
  )
}
