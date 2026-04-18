// AAR-112: Dispatch-Portal Sachverständige-Liste (Read-Only).
// AAR-151: Import aus shared components — /admin/sachverstaendige rendert
// jetzt die Karte direkt, die Liste lebt ausschließlich im Dispatch-Portal
// als Tabellen-Sicht.
import { createClient } from '@/lib/supabase/server'
import SachverstaendigeList from '@/components/SachverstaendigeList'

const BASE_SELECT = 'id, profile_id, gebiet_plz, paket, offene_faelle, ist_aktiv, gutachter_typ, qualifikationen_neu, spezifikationen, schadenarten, onboarding_status, anzahlung_status, standort_adresse, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, paket_umkreis_km, werbebudget_guthaben_netto, organisation_id, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, ablehnungen_30_tage, deaktiviert_grund, deaktiviert_am, geloescht_am, profiles(vorname, nachname, email, telefon)'

export default async function DispatchSachverstaendigePage() {
  const supabase = await createClient()

  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select(BASE_SELECT)
    .is('geloescht_am', null)
    .order('created_at', { ascending: false })

  const sachverstaendige = ((svList ?? []) as unknown as Record<string, unknown>[]).map((sv) => {
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
      radiusKm: Number(sv.paket_umkreis_km) || 40,
      paket: sv.paket as string,
      offeneFaelle: Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0,
      maxFaelleMonat: Number(sv.paket_faelle_gesamt) || 10,
      standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
      standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      organisationId: sv.organisation_id as string | null,
      gutachterTyp: (sv.gutachter_typ as string) ?? 'kfz-gutachter',
      standortAdresse: sv.standort_adresse as string | null,
      guthaben: Number(sv.werbebudget_guthaben_netto) || 0,
      qualifikationen: (sv.qualifikationen_neu as string[] | null) ?? [],
      spezifikationen: (sv.spezifikationen as string[] | null) ?? [],
      schadenarten: (sv.schadenarten as string[] | null) ?? [],
      anzahlungStatus: (sv.anzahlung_status as string) ?? 'offen',
      istAktiv: sv.ist_aktiv !== false,
      deaktiviertGrund: (sv.deaktiviert_grund as string | null) ?? null,
      deaktiviertAm: (sv.deaktiviert_am as string | null) ?? null,
      geloeschtAm: (sv.geloescht_am as string | null) ?? null,
      portalZugangFreigeschaltet: (sv.portal_zugang_freigeschaltet as boolean | null) ?? null,
      vertragUnterschrieben: (sv.vertrag_unterschrieben as boolean | null) ?? null,
      gesperrtSeit: (sv.gesperrt_seit as string | null) ?? null,
      ablehnungen30Tage: Number(sv.ablehnungen_30_tage) || 0,
    }
  })

  return <SachverstaendigeList sachverstaendige={sachverstaendige} basePath="/dispatch" />
}
