import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import ProfilClient from './ProfilClient'
// AAR-500 N5: Benachrichtigungs-Präferenzen in Settings-Section laden
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
// AAR-707: Google-Verbindungs-Status aus profiles.google_refresh_token (Single
// Source of Truth — sachverstaendige.kalender_sync_aktiv ist Legacy-Drift).
import { isGoogleConnected } from '@/lib/google/oauth-client'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const [{ data: profile }, sv, faelleResult, bewertungRes] = await Promise.all([
    supabase
      .from('profiles')
      // AAR-344: twofa_telefon für „Nummer ändern"-Komponente
      // AAR-369: avatar_url + anzeigename + profilbeschreibung
      .select('anrede, titel, vorname, nachname, telefon, rolle, twofa_telefon, avatar_url, anzeigename, profilbeschreibung')
      .eq('id', user!.id)
      .single(),
    getGutachterForUser(supabase, user!.id, 'id, paket, gebiet_plz, ist_aktiv, paket_faelle_gesamt, offene_faelle, kalender_typ, kalender_sync_aktiv, kalender_sync_letzte, qualifikationen_neu, spezifikationen, schadenarten, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, firmenname, rechtsform, steuernummer, ust_id, hrb, rolle_in_organisation, community_anonym'),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', user!.id),
    supabase
      .from('google_bewertungen_cache')
      .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am, photo_reference')
      .eq('profile_id', user!.id)
      .maybeSingle(),
  ])

  // Pending termine (need confirmation)
  let pendingTermine: { id: string; fall_id: string; start_zeit: string; end_zeit: string; fall_nummer?: string }[] = []
  if (sv?.id) {
    const { data: termine } = await supabase
      .from('gutachter_termine')
      .select('id, fall_id, start_zeit, end_zeit')
      .eq('sv_id', sv.id)
      .eq('status', 'vorschlag')
      .order('start_zeit', { ascending: true })
    pendingTermine = termine ?? []
  }

  const prefsRes = await getMyNotificationPreferences()
  const googleConnected = user ? await isGoogleConnected(user.id) : false
  const bewertung = bewertungRes?.data ?? null

  return (
    <>
    {bewertung?.durchschnitt != null && (
      <div className="px-4 pt-4 max-w-2xl mx-auto">
        <GoogleBewertungBadge
          durchschnitt={bewertung.durchschnitt as number}
          anzahl={bewertung.anzahl_bewertungen as number | null}
          zuletztAktualisiert={bewertung.zuletzt_aktualisiert_am as string | null}
        />
      </div>
    )}
    <ProfilClient
      email={user!.email ?? ''}
      profile={profile ?? { anrede: null, titel: null, vorname: null, nachname: null, telefon: null, rolle: 'sachverstaendiger', twofa_telefon: null, avatar_url: null, anzeigename: null, profilbeschreibung: null }}
      sv={(sv as never) ?? { id: '', paket: '', gebiet_plz: null, ist_aktiv: true, paket_faelle_gesamt: 10, offene_faelle: 0, kalender_typ: 'keiner', kalender_sync_aktiv: false, kalender_sync_letzte: null, qualifikationen_neu: [], spezifikationen: [], schadenarten: [], standort_adresse: null, standort_plz: null, standort_lat: null, standort_lng: null, standort_place_id: null, firmenname: null, rechtsform: null, steuernummer: null, ust_id: null, hrb: null, rolle_in_organisation: null, community_anonym: false }}
      faelleCount={faelleResult.count ?? 0}
      pendingTermine={pendingTermine}
      notificationPrefs={
        prefsRes.prefs ?? {
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: 'Europe/Berlin',
          channel_opt_outs: [],
          event_opt_outs: {},
        }
      }
      googleConnected={googleConnected}
    />
    </>
  )
}
