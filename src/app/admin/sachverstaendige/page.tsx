import { createClient } from '@/lib/supabase/server'
import KarteClient from '../karte/KarteClient'

const BASE_SELECT = 'id, profile_id, gebiet_plz, paket, offene_faelle, max_faelle_monat, ist_aktiv, gutachter_typ, qualifikationen_neu, spezifikationen, schadenarten, onboarding_abgeschlossen, anzahlung_status, standort_adresse, standort_lat, standort_lng, lat, lng, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, radius_km, guthaben, organisation_id, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, ablehnungen_30_tage, profiles(vorname, nachname, email, telefon)'
const EXTENDED_SELECT = BASE_SELECT.replace('organisation_id,', 'organisation_id, deaktiviert_grund, deaktiviert_am, geloescht_am,')

export default async function SachverstaendigePage() {
  const supabase = await createClient()

  // Try with extended columns + geloescht_am IS NULL filter; fall back if columns don't exist
  let svList: Record<string, unknown>[] | null = null
  const extended = await supabase.from('sachverstaendige').select(EXTENDED_SELECT).is('geloescht_am', null).order('created_at', { ascending: false })
  if (!extended.error) {
    svList = extended.data as unknown as Record<string, unknown>[] | null
  } else {
    // Columns don't exist yet — load all, no geloescht_am filter possible
    const base = await supabase.from('sachverstaendige').select(BASE_SELECT).order('created_at', { ascending: false })
    svList = base.data as Record<string, unknown>[] | null
  }

  // Map ALL SVs (KarteClient handles filtering by state)
  const sachverstaendige = (svList ?? []).map((sv) => {
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
      offeneFaelle: Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0,
      maxFaelleMonat: Number(sv.paket_faelle_gesamt) || Number(sv.max_faelle_monat) || 10,
      standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : (sv.lat != null ? Number(sv.lat) : null),
      standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : (sv.lng != null ? Number(sv.lng) : null),
      organisationId: sv.organisation_id as string | null,
      gutachterTyp: (sv.gutachter_typ as string) ?? 'kfz-gutachter',
      standortAdresse: sv.standort_adresse as string | null,
      guthaben: Number(sv.guthaben) || 0,
      // KFZ-154 Cleanup: legacy qualifikationen-Spalte gedroppt
      qualifikationen: (sv.qualifikationen_neu as string[] | null) ?? [],
      spezifikationen: (sv.spezifikationen as string[] | null) ?? [],
      schadenarten: (sv.schadenarten as string[] | null) ?? [],
      anzahlungStatus: (sv.anzahlung_status as string) ?? 'offen',
      istAktiv: sv.ist_aktiv !== false,
      deaktiviertGrund: (sv.deaktiviert_grund as string | null) ?? null,
      deaktiviertAm: (sv.deaktiviert_am as string | null) ?? null,
      geloeschtAm: (sv.geloescht_am as string | null) ?? null,
      // ARCH-1 POLISH Befund 1: Status-Felder fuer Badges
      portalZugangFreigeschaltet: (sv.portal_zugang_freigeschaltet as boolean | null) ?? null,
      vertragUnterschrieben: (sv.vertrag_unterschrieben as boolean | null) ?? null,
      gesperrtSeit: (sv.gesperrt_seit as string | null) ?? null,
      ablehnungen30Tage: Number(sv.ablehnungen_30_tage) || 0,
    }
  })

  // Cases for map
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, leads!faelle_lead_id_fkey(vorname, nachname)')
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
