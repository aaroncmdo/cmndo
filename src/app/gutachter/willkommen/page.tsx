import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WillkommenClient from './WillkommenClient'

/**
 * ARCH-1 Phase 1: /gutachter/willkommen
 *
 * Die neue Onboarding-Page nach dem Self-Service-Wegfall. SVs werden vom
 * Admin angelegt (siehe ARCH-1 Phase 2 Admin-UI), beim ersten Login landen
 * sie hier und sehen einen 3-Step Wizard:
 *   1. Konditionen + Stammdaten (read-only)
 *   2. Vertrag unterzeichnen
 *   3. Stripe-Anzahlung
 *
 * Zugang ist nur erlaubt fuer SVs deren onboarding_status NICHT 'bezahlt' und
 * portal_zugang_freigeschaltet=false ist. Wer schon durch ist landet im
 * Dashboard, wer keinen SV-Eintrag hat im Login mit Fehler.
 */
export default async function GutachterWillkommenPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // SV laden (profile_id ODER user_id Fallback)
  const svSelect = 'id, paket, max_faelle_monat, paket_umkreis_km, onboarding_status, onboarding_anzahlung_betrag, vertrag_unterschrieben, portal_zugang_freigeschaltet, standort_adresse, standort_plz, organisation_id, rolle_in_organisation'
  let { data: sv } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!sv) {
    const r = await supabase
      .from('sachverstaendige')
      .select(svSelect)
      .eq('user_id', user.id)
      .maybeSingle()
    sv = r.data
  }

  // Kein SV → Aaron muss anlegen
  if (!sv) {
    redirect('/login?error=Dein%20Account%20ist%20noch%20nicht%20eingerichtet.%20Bitte%20kontaktiere%20support%40claimondo.de')
  }

  // Schon vollstaendig durch → Dashboard
  if (sv.portal_zugang_freigeschaltet) {
    redirect('/gutachter')
  }

  // Profil-Daten
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  // Vertragsvorlagen (NB + KV)
  const { data: vorlagen } = await supabase
    .from('vertragsvorlagen')
    .select('id, typ, titel, version, inhalt_html, pflicht_unterschrift')
    .eq('aktiv', true)

  const nbVorlage = (vorlagen ?? []).find(v => v.typ === 'nutzungsbedingungen') ?? null
  const kvVorlage = (vorlagen ?? []).find(v => v.typ === 'kooperationsvertrag_muster') ?? null

  // Falls Sub-SV einer Org: Org-Daten laden (fuer "Du gehoerst zu ..." Hinweis)
  let organisation: { id: string; name: string; typ: string | null } | null = null
  if (sv.organisation_id) {
    const { data: org } = await supabase
      .from('organisationen')
      .select('id, name, typ')
      .eq('id', sv.organisation_id)
      .maybeSingle()
    organisation = org ?? null
  }

  // URL-Param ?step=stripe ueberschreibt den initial-Step (z.B. nach Stripe-Cancel)
  const params = await searchParams
  const stepOverride = params?.step === 'stripe' ? 2 : undefined

  return (
    <WillkommenClient
      sv={{
        id: sv.id,
        paket: sv.paket ?? 'standard',
        max_faelle_monat: sv.max_faelle_monat ?? 0,
        paket_umkreis_km: sv.paket_umkreis_km ?? 0,
        onboarding_anzahlung_betrag: Number(sv.onboarding_anzahlung_betrag ?? 0),
        onboarding_status: sv.onboarding_status,
        vertrag_unterschrieben: !!sv.vertrag_unterschrieben,
        standort_adresse: sv.standort_adresse,
        standort_plz: sv.standort_plz,
        rolle_in_organisation: sv.rolle_in_organisation,
      }}
      profile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      organisation={organisation}
      nbVorlage={nbVorlage}
      kvVorlage={kvVorlage}
      stepOverride={stepOverride}
    />
  )
}
