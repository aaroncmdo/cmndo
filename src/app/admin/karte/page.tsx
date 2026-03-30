import { createClient } from '@/lib/supabase/server'
import KarteClient from './KarteClient'

export default async function KartePage() {
  const supabase = await createClient()

  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select(
      'id, gebiet_plz, radius_km, paket, offene_faelle, max_faelle_monat, ist_aktiv, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_lat, standort_lng, standort_adresse, lat, lng, organisation_id, gutachter_typ, profiles(vorname, nachname, email)'
    )
    .eq('ist_aktiv', true)

  const { data: faelle } = await supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, leads(vorname, nachname)'
    )
    .not('status', 'in', '("abgeschlossen","storniert")')

  const sachverstaendige = (svList ?? []).map((sv) => {
    const profileRaw = sv.profiles as unknown
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
      vorname: string | null
      nachname: string | null
      email: string | null
    } | null
    return {
      id: sv.id as string,
      name: profile
        ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim()
        : 'Unbekannt',
      email: profile?.email ?? '',
      gebietPlz: (sv.gebiet_plz ?? []) as string[],
      radiusKm: (sv.paket_umkreis_km as number) ?? (sv.radius_km as number) ?? 40,
      paket: sv.paket as string,
      offeneFaelle: (sv.paket_faelle_genutzt as number) ?? (sv.offene_faelle as number) ?? 0,
      maxFaelleMonat: (sv.paket_faelle_gesamt as number) ?? (sv.max_faelle_monat as number) ?? 10,
      standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : (sv.lat != null ? Number(sv.lat) : null),
      standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : (sv.lng != null ? Number(sv.lng) : null),
      organisationId: sv.organisation_id as string | null,
      gutachterTyp: (sv.gutachter_typ as string) ?? 'kfz-gutachter',
    }
  })

  const offeneFaelle = (faelle ?? []).map((f) => {
    const leadRaw = f.leads as unknown
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as {
      vorname: string | null
      nachname: string | null
    } | null
    return {
      id: f.id as string,
      fallNummer: (f.fall_nummer as string) ?? (f.id as string).slice(0, 8),
      status: f.status as string,
      schadensUrsache: f.schadens_ursache as string | null,
      adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort]
        .filter(Boolean)
        .join(', '),
      schadensPLZ: f.schadens_plz as string | null,
      schadensOrt: f.schadens_ort as string | null,
      svId: f.sv_id as string | null,
      kunde: lead
        ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
        : '—',
    }
  })

  return <KarteClient sachverstaendige={sachverstaendige} faelle={offeneFaelle} />
}
