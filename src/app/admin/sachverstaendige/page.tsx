// AAR-151: /admin/sachverstaendige ist jetzt die integrierte Karten-Ansicht
// (ONE VIEW). Die Karte-Page wurde aus karte/page.tsx in die Root-Route
// gemerged. Sidebar, Filter und Onboarding-Drawer leben direkt im
// KarteHubClient. Die Liste ist nicht mehr eigenständig (SachverstaendigeList-
// Client wird noch vom Dispatch-Portal genutzt, bleibt daher erhalten).
// AAR-122 / AAR-129 / AAR-130 / AAR-131 Historie siehe alte karte/page.tsx.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KarteHubClient, { type SvMarker } from './_karte/KarteHubClient'

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
    // AAR-659 / AAR-360: Zusätzlich urlaub_von/bis + verifiziert +
    // Quali-Ausweis-Nummern + notizen — Felder die „kann SV aktuell
    // arbeiten?" mitbestimmen, bisher nur auf der Detail-Seite.
    .select(
      'id, paket, verifizierung_status, standort_lat, standort_lng, ist_aktiv, isochrone_polygon, paket_umkreis_km, gutachter_typ, offene_faelle, paket_faelle_genutzt, paket_faelle_gesamt, ablehnungen_30_tage, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, urlaub_von, urlaub_bis, verifiziert, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, notizen, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, avatar_url)',
    )
    .is('geloescht_am', null)
  if (svErr) console.error('[admin/sachverstaendige] SV-Query:', svErr.message)

  type SvRow = {
    id: string
    paket: string | null
    verifizierung_status: string | null
    standort_lat: number | null
    standort_lng: number | null
    ist_aktiv: boolean
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
      bvskNr: sv.bvsk_mitgliedsnummer ?? null,
      ihkNr: sv.ihk_zertifikat_nummer ?? null,
      oebuvNr: sv.oebuv_bestellungsnummer ?? null,
      notizen: sv.notizen ?? null,
    }
  })

  // Pending Basic-SVs fuer den Queue-Badge im Header
  const basicFreigabenCount = svRows.filter(
    sv => sv.paket === 'basic' && sv.verifizierung_status === 'ausstehend',
  ).length

  return <KarteHubClient svs={svs} basicFreigabenCount={basicFreigabenCount} />
}
