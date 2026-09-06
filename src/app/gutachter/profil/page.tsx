import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import ProfilClient from './ProfilClient'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
// AAR-939: Einstieg ins SV-Self-Service-Portal (Embed-Sites + Anfragen)
import Link from 'next/link'
import { Code2Icon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // CMM-49: Bridge-Intersection fuer den faelle-Count (claims ⊋ faelle) — vor Promise.all
  // prefetchen, dann claims-Count statt faelle. sv_id 0-diff; transitional bis faelle-DROP.
  const { data: bridgeRows } = await supabase.from('faelle_claim_bridge').select('claim_id')
  const faelleClaimIds = (bridgeRows ?? []).map((b) => b.claim_id)

  // FIX (Dashboard-Metrik-Audit 06.07.): getGutachterForUser VOR die Promise.all gezogen,
  // damit der Faelle-Count auf sv.id filtern kann. Vorher .eq('sv_id', user.id) — aber
  // claims.sv_id referenziert sachverstaendige.id, NICHT die auth user.id -> der Count war
  // IMMER 0 ("Zugewiesene Faelle gesamt: 0" fuer JEDEN SV, egal wie viele Faelle).
  const sv = await getGutachterForUser(supabase, user.id, 'id, paket, gebiet_plz, ist_aktiv, paket_faelle_gesamt, offene_faelle, qualifikationen_neu, spezifikationen, schadenarten, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, firmenname, rechtsform, steuernummer, ust_id, hrb, rolle_in_organisation, community_anonym')

  const [{ data: profile }, faelleResult, bewertungRes] = await Promise.all([
    supabase
      .from('profiles')
      // AAR-344: twofa_telefon für „Nummer ändern"-Komponente
      // AAR-369: avatar_url + anzeigename + profilbeschreibung
      .select('anrede, titel, vorname, nachname, telefon, rolle, twofa_telefon, avatar_url, anzeigename, profilbeschreibung')
      .eq('id', user.id)
      .single(),
    supabase
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', sv?.id ?? '00000000-0000-0000-0000-000000000000')
      .in('id', faelleClaimIds),
    supabase
      .from('google_bewertungen_cache')
      .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am, photo_reference')
      .eq('profile_id', user.id)
      .maybeSingle(),
  ])

  // Pending termine (need confirmation)
  let pendingTermine: { id: string; fall_id: string; start_zeit: string; end_zeit: string; claim_nummer?: string }[] = []
  if (sv?.id) {
    const { data: termine } = await supabase
      .from('gutachter_termine')
      .select('id, fall_id, start_zeit, end_zeit')
      // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee_id/assignee_typ
      .eq('assignee_id', sv.id)
      .eq('assignee_typ', 'sachverstaendiger')
      // FIX (Status-Enum-Audit 05.07.): gutachter_termine.status hat kein 'vorschlag'
      // -> .eq war immer leer, SV sah nie offene Vorschlaege. SV-actionable =
      // reserviert (Slot awaiting Bestaetigung) + gegenvorschlag (vgl. sv/termin canAct).
      .in('status', ['reserviert', 'gegenvorschlag'])
      .order('start_zeit', { ascending: true })
    pendingTermine = termine ?? []
  }

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
    {/* AAR-939: Einstieg ins SV-Self-Service-Portal (Monika-Embed) */}
    <div className="px-4 pt-4 max-w-2xl mx-auto">
      <Link
        href="/gutachter/einstellungen/embed"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo rounded-ios-lg"
      >
        <SectionCard
          title="Embed-Sites & Anfragen"
          icon={<Code2Icon style={{ width: 18, height: 18 }} />}
        >
          <p className="text-sm text-claimondo-ondo">
            Binden Sie das Monika-Widget auf Ihrer Website ein und sehen Sie Ihre Anfragen — direkt in Ihren Einstellungen.
          </p>
        </SectionCard>
      </Link>
    </div>
    <ProfilClient
      email={user.email ?? ''}
      profile={profile ?? { anrede: null, titel: null, vorname: null, nachname: null, telefon: null, rolle: 'sachverstaendiger', twofa_telefon: null, avatar_url: null, anzeigename: null, profilbeschreibung: null }}
      sv={(sv as never) ?? { id: '', paket: '', gebiet_plz: null, ist_aktiv: true, paket_faelle_gesamt: 10, offene_faelle: 0, qualifikationen_neu: [], spezifikationen: [], schadenarten: [], standort_adresse: null, standort_plz: null, standort_lat: null, standort_lng: null, standort_place_id: null, firmenname: null, rechtsform: null, steuernummer: null, ust_id: null, hrb: null, rolle_in_organisation: null, community_anonym: false }}
      faelleCount={faelleResult.count ?? 0}
      pendingTermine={pendingTermine}
    />
    </>
  )
}
