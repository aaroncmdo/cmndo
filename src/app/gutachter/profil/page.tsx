import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import ProfilClient from './ProfilClient'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const [{ data: profile }, sv, faelleResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('anrede, titel, vorname, nachname, telefon, rolle')
      .eq('id', user!.id)
      .single(),
    getGutachterForUser(supabase, user!.id, 'id, paket, gebiet_plz, ist_aktiv, max_faelle_monat, offene_faelle, kalender_typ, kalender_sync_aktiv, kalender_sync_letzte, qualifikationen, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, firmenname, rechtsform, steuernummer, ust_id, hrb'),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', user!.id),
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

  return (
    <ProfilClient
      email={user!.email ?? ''}
      profile={profile ?? { anrede: null, titel: null, vorname: null, nachname: null, telefon: null, rolle: 'sachverstaendiger' }}
      sv={sv ?? { id: '', paket: '', gebiet_plz: null, ist_aktiv: true, max_faelle_monat: 10, offene_faelle: 0, kalender_typ: 'keiner', kalender_sync_aktiv: false, kalender_sync_letzte: null, qualifikationen: [], standort_adresse: null, standort_plz: null, standort_lat: null, standort_lng: null, standort_place_id: null, firmenname: null, rechtsform: null, steuernummer: null, ust_id: null, hrb: null }}
      faelleCount={faelleResult.count ?? 0}
      pendingTermine={pendingTermine}
    />
  )
}
