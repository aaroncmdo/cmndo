import { createClient } from '@/lib/supabase/server'
import KarteClient from '../karte/KarteClient'

export default async function SachverstaendigePage() {
  const supabase = await createClient()

  // Fetch SVs with all fields needed for both map and table
  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select(
      'id, profile_id, gebiet_plz, paket, offene_faelle, max_faelle_monat, ist_aktiv, gutachter_typ, qualifikationen, onboarding_abgeschlossen, anzahlung_status, standort_adresse, standort_lat, standort_lng, lat, lng, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, radius_km, guthaben, organisation_id, profiles(vorname, nachname, email, telefon)'
    )
    .order('created_at', { ascending: false })

  // Active SVs for map
  const sachverstaendige = (svList ?? [])
    .filter(sv => sv.ist_aktiv)
    .map((sv) => {
      const profileRaw = sv.profiles as unknown
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
        vorname: string | null; nachname: string | null; email: string | null; telefon: string | null
      } | null
      return {
        id: sv.id as string,
        name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : 'Unbekannt',
        email: profile?.email ?? '',
        telefon: profile?.telefon ?? '',
        gebietPlz: (sv.gebiet_plz ?? []) as string[],
        radiusKm: Number(sv.paket_umkreis_km) || Number(sv.radius_km) || 40,
        paket: sv.paket as string,
        offeneFaelle: Number((sv as Record<string, unknown>).paket_faelle_genutzt) || Number(sv.offene_faelle) || 0,
        maxFaelleMonat: Number((sv as Record<string, unknown>).paket_faelle_gesamt) || Number(sv.max_faelle_monat) || 10,
        standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : (sv.lat != null ? Number(sv.lat) : null),
        standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : (sv.lng != null ? Number(sv.lng) : null),
        organisationId: sv.organisation_id as string | null,
        gutachterTyp: (sv.gutachter_typ as string) ?? 'kfz-gutachter',
        standortAdresse: (sv as Record<string, unknown>).standort_adresse as string | null,
        guthaben: Number((sv as Record<string, unknown>).guthaben) || 0,
        qualifikationen: ((sv as Record<string, unknown>).qualifikationen as string[] | null) ?? [],
        anzahlungStatus: (sv as Record<string, unknown>).anzahlung_status as string ?? 'offen',
      }
    })

  // Cases for map
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, leads(vorname, nachname)')
    .not('status', 'in', '("abgeschlossen","storniert")')

  const offeneFaelle = (faelle ?? []).map((f) => {
    const leadRaw = f.leads as unknown
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
    return {
      id: f.id as string,
      fallNummer: (f.fall_nummer as string) ?? (f.id as string).slice(0, 8),
      status: f.status as string,
      schadensUrsache: f.schadens_ursache as string | null,
      adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '),
      schadensPLZ: f.schadens_plz as string | null,
      schadensOrt: f.schadens_ort as string | null,
      svId: f.sv_id as string | null,
      kunde: lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—',
    }
  })

  return <KarteClient sachverstaendige={sachverstaendige} faelle={offeneFaelle} />
}
