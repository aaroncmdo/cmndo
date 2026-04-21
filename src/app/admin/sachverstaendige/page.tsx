// AAR-151: /admin/sachverstaendige ist jetzt die integrierte Karten-Ansicht
// (ONE VIEW). Die Karte-Page wurde aus karte/page.tsx in die Root-Route
// gemerged. Sidebar, Filter und Onboarding-Drawer leben direkt im
// KarteHubClient. Die Liste ist nicht mehr eigenständig (SachverstaendigeList-
// Client wird noch vom Dispatch-Portal genutzt, bleibt daher erhalten).
// AAR-122 / AAR-129 / AAR-130 / AAR-131 Historie siehe alte karte/page.tsx.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KarteHubClient, {
  type SvMarker,
  type CommunityMarker,
  type OrgMarker,
} from './_karte/KarteHubClient'

export const dynamic = 'force-dynamic'

export default async function SachverstaendigeHubPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // SVs mit Standort + Isochrone + Sidebar-Felder (Kontingent, Ablehnungen, Status)
  // AAR-657: profiles-Embed muss den FK explizit benennen — sachverstaendige
  // hat 4 FKs auf profiles (profile_id + gesperrt_von_user_id +
  // sa_vorlage_geprueft_von_user_id + verifiziert_von), Default-Embed wirft
  // PGRST201 und liefert data=undefined → „0 von 0" in der UI.
  const { data: svRaw, error: svErr } = await supabase
    .from('sachverstaendige')
    // AAR-659: Zusätzlich urlaub_von/bis + verifiziert + sa_vorlage_status +
    // Quali-Ausweis-Nummern + notizen — Felder die „kann SV aktuell
    // arbeiten?" mitbestimmen, bisher nur auf der Detail-Seite.
    .select(
      'id, paket, standort_lat, standort_lng, ist_aktiv, organisation_id, isochrone_polygon, paket_umkreis_km, gutachter_typ, offene_faelle, paket_faelle_genutzt, paket_faelle_gesamt, ablehnungen_30_tage, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, urlaub_von, urlaub_bis, verifiziert, sa_vorlage_status, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, notizen, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, avatar_url)',
    )
    .is('geloescht_am', null)
  if (svErr) console.error('[admin/sachverstaendige] SV-Query:', svErr.message)

  type SvRow = {
    id: string
    paket: string | null
    standort_lat: number | null
    standort_lng: number | null
    ist_aktiv: boolean
    organisation_id: string | null
    isochrone_polygon: unknown
    paket_umkreis_km: number | null
    gutachter_typ: string | null
    offene_faelle: number | null
    paket_faelle_genutzt: number | null
    paket_faelle_gesamt: number | null
    ablehnungen_30_tage: number | null
    portal_zugang_freigeschaltet: boolean | null
    vertrag_unterschrieben: boolean | null
    gesperrt_seit: string | null
    urlaub_von: string | null
    urlaub_bis: string | null
    verifiziert: boolean | null
    sa_vorlage_status: string | null
    bvsk_mitgliedsnummer: string | null
    ihk_zertifikat_nummer: string | null
    oebuv_bestellungsnummer: string | null
    notizen: string | null
    profiles: unknown
  }
  const svRows = (svRaw ?? []) as unknown as SvRow[]

  const svs: SvMarker[] = svRows.map((sv) => {
    const pRel = sv.profiles
    const p = (Array.isArray(pRel) ? pRel[0] : pRel) as
      | { vorname: string | null; nachname: string | null; avatar_url: string | null }
      | null
    return {
      id: sv.id,
      name: p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : 'Unbekannt',
      vorname: p?.vorname ?? null,
      nachname: p?.nachname ?? null,
      avatarUrl: p?.avatar_url ?? null,
      paket: sv.paket,
      lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
      lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      istAktiv: sv.ist_aktiv !== false,
      isochrone: (sv.isochrone_polygon as SvMarker['isochrone']) ?? null,
      einsatzKm: Number(sv.paket_umkreis_km) || null,
      gutachterTyp: sv.gutachter_typ ?? 'kfz-gutachter',
      offeneFaelle: Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0,
      maxFaelleMonat: Number(sv.paket_faelle_gesamt) || 10,
      ablehnungen30Tage: Number(sv.ablehnungen_30_tage) || 0,
      portalZugangFreigeschaltet: sv.portal_zugang_freigeschaltet ?? null,
      vertragUnterschrieben: sv.vertrag_unterschrieben ?? null,
      gesperrtSeit: sv.gesperrt_seit ?? null,
      urlaubVon: sv.urlaub_von ?? null,
      urlaubBis: sv.urlaub_bis ?? null,
      verifiziert: sv.verifiziert ?? false,
      saVorlageStatus: sv.sa_vorlage_status ?? null,
      bvskNr: sv.bvsk_mitgliedsnummer ?? null,
      ihkNr: sv.ihk_zertifikat_nummer ?? null,
      oebuvNr: sv.oebuv_bestellungsnummer ?? null,
      notizen: sv.notizen ?? null,
    }
  })

  // Organisationen (Communities + Büros + Akademien) mit Geo-Feldern
  const { data: orgRaw } = await supabase
    .from('organisationen')
    .select(
      'id, name, typ, community_exklusiv, community_max_faelle_monat, standort_lat, standort_lng, einsatzgebiet_zentrum_lat, einsatzgebiet_zentrum_lng, einsatzgebiet_km, einsatzgebiet_radius_km, isochrone_polygon',
    )

  type OrgRow = {
    id: string
    name: string
    typ: 'community' | 'buero' | 'akademie' | string
    community_exklusiv: boolean | null
    community_max_faelle_monat: number | null
    standort_lat: number | null
    standort_lng: number | null
    einsatzgebiet_zentrum_lat: number | null
    einsatzgebiet_zentrum_lng: number | null
    einsatzgebiet_km: number | null
    einsatzgebiet_radius_km: number | null
    isochrone_polygon: unknown
  }
  const orgRows = (orgRaw ?? []) as unknown as OrgRow[]

  // Legacy-Fallback: SV-Member-Standort für Alt-Orgs ohne eigene Koordinaten
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
      return {
        lat: Number(o.einsatzgebiet_zentrum_lat),
        lng: Number(o.einsatzgebiet_zentrum_lng),
      }
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
        isochrone: (o.isochrone_polygon as CommunityMarker['isochrone']) ?? null,
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
        isochrone: (o.isochrone_polygon as OrgMarker['isochrone']) ?? null,
        einsatzKm: Number(o.einsatzgebiet_km) || Number(o.einsatzgebiet_radius_km) || null,
      }
    })

  return (
    <KarteHubClient svs={svs} communities={communities} organisationen={organisationen} />
  )
}
