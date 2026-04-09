import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WillkommenClient from './WillkommenClient'

/**
 * ARCH-1 Phase 1: /gutachter/willkommen
 *
 * Die neue Onboarding-Page nach dem Self-Service-Wegfall. SVs werden vom
 * Admin angelegt (siehe ARCH-1 Phase 2 Admin-UI), beim ersten Login landen
 * sie hier und durchlaufen je nach Rolle einen anderen Flow:
 *
 *   - solo            : 3-Step Wizard (Konditionen, Vertrag+Sig, Stripe)
 *   - buero_inhaber   : 3-Step Wizard mit Sub-Tabelle + Buero-Vertrag +
 *                       Buero-Sammel-Anzahlung (alle Sub-Standorte zusammen)
 *   - sub_mitarbeiter : 2-Step Light-Flow (eigenes Paket + Checkbox-AGB)
 *                       danach Warte-Page oder direkt Dashboard wenn der
 *                       Inhaber bereits bezahlt hat
 *
 * Zugang ist nur erlaubt fuer SVs deren portal_zugang_freigeschaltet=false
 * ist. Wer schon durch ist landet im Dashboard, wer keinen SV-Eintrag hat
 * im Login mit Fehler.
 */
export default async function GutachterWillkommenPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; stripe_success?: string; session_id?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // ARCH-1: Ein User kann mehrere sachverstaendige-Eintraege haben
  // (Inhaber + Sub-Standort, oder mehrere Sub-Standorte mit gleicher Email).
  // Wir laden ALLE und entscheiden anhand der Rollen-Prioritaet welchen
  // Eintrag wir hier behandeln:
  //   1. inhaber           → Buero-Inhaber-Flow
  //   2. mitarbeiter/...   → Sub-Mitarbeiter-Flow
  //   3. ohne organisation → Solo-Flow
  // KFZ-157: logo_url aufnehmen damit der Wizard weiss ob Step 4 noch
  // angezeigt werden muss oder bereits ein Logo existiert.
  const svSelect =
    'id, paket, max_faelle_monat, paket_umkreis_km, onboarding_status, onboarding_anzahlung_betrag, vertrag_unterschrieben, portal_zugang_freigeschaltet, standort_adresse, standort_plz, organisation_id, rolle_in_organisation, logo_url, brand_primary, brand_secondary, use_custom_branding'
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)

  const allSvs = svRows ?? []

  if (!allSvs.length) {
    redirect('/login?error=Dein%20Account%20ist%20noch%20nicht%20eingerichtet.%20Bitte%20kontaktiere%20support%40claimondo.de')
  }

  // Rolle ableiten + primaeren SV-Eintrag waehlen
  type Rolle = 'solo' | 'buero_inhaber' | 'sub_mitarbeiter'
  const SUB_ROLLEN = new Set(['mitarbeiter', 'akademie_sub', 'community_member'])

  const inhaberSv = allSvs.find(s => (s.rolle_in_organisation ?? '').toLowerCase() === 'inhaber')
  const subSv = allSvs.find(s => SUB_ROLLEN.has((s.rolle_in_organisation ?? '').toLowerCase()))
  const soloSv = allSvs.find(s => !s.organisation_id)

  let rolle: Rolle
  let sv: (typeof allSvs)[number]
  if (inhaberSv) {
    rolle = 'buero_inhaber'
    sv = inhaberSv
  } else if (subSv) {
    rolle = 'sub_mitarbeiter'
    sv = subSv
  } else if (soloSv) {
    rolle = 'solo'
    sv = soloSv
  } else {
    // Defensive: SV hat organisation_id aber keine bekannte Rolle → wie Solo behandeln
    rolle = 'solo'
    sv = allSvs[0]
  }

  // KFZ-157: Wenn der User schon freigeschaltet ist, sind wir normalerweise
  // fertig. Eine Ausnahme: Solo + Inhaber, die zwar bezahlt haben, aber
  // noch kein Logo hochgeladen haben — die lassen wir Step 4 nochmal sehen.
  // Sub-Mitarbeiter sehen Step 4 NIE — sie erben das Branding der Org.
  const needsLogoStep =
    rolle !== 'sub_mitarbeiter' && !((sv as { logo_url?: string | null }).logo_url)
  if (sv.portal_zugang_freigeschaltet && !needsLogoStep) {
    redirect('/gutachter')
  }

  // Profil-Daten
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  // Vertragsvorlagen (NB + KV) — fuer Solo + Inhaber
  const { data: vorlagen } = await supabase
    .from('vertragsvorlagen')
    .select('id, typ, titel, version, inhalt_html, pflicht_unterschrift')
    .eq('aktiv', true)

  const nbVorlage = (vorlagen ?? []).find(v => v.typ === 'nutzungsbedingungen') ?? null
  const kvVorlage = (vorlagen ?? []).find(v => v.typ === 'kooperationsvertrag_muster') ?? null

  // Org-Daten + ggf. Sub-SVs (fuer Inhaber + Sub-Mitarbeiter)
  let organisation: { id: string; name: string; typ: string | null; onboarding_status: string | null } | null = null
  let subSvs: Array<{
    id: string
    name: string | null
    standort_adresse: string | null
    standort_plz: string | null
    paket: string
    onboarding_anzahlung_betrag: number
    profile_email: string | null
  }> = []
  let gesamtAnzahlung = 0

  if (sv.organisation_id) {
    const { data: org } = await supabase
      .from('organisationen')
      .select('id, name, typ, onboarding_status')
      .eq('id', sv.organisation_id)
      .maybeSingle()
    organisation = org ?? null

    if (rolle === 'buero_inhaber') {
      // Alle Sub-Standorte (mitarbeiter) der Org laden + Mitarbeiter-Email
      const { data: subs } = await supabase
        .from('sachverstaendige')
        .select('id, standort_adresse, standort_plz, paket, onboarding_anzahlung_betrag, profile_id, rolle_in_organisation')
        .eq('organisation_id', sv.organisation_id)

      const subList = (subs ?? []).filter(s => {
        const r = (s.rolle_in_organisation ?? '').toLowerCase()
        return SUB_ROLLEN.has(r)
      })

      // Email-Lookup pro Sub
      const profileIds = Array.from(new Set(subList.map(s => s.profile_id).filter(Boolean) as string[]))
      let profileMap = new Map<string, string>()
      if (profileIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', profileIds)
        profileMap = new Map((profs ?? []).map(p => [p.id, p.email ?? '']))
      }

      subSvs = subList.map(s => ({
        id: s.id,
        name: null, // Sub-Standorte haben keinen separaten Namen — wir zeigen Adresse
        standort_adresse: s.standort_adresse,
        standort_plz: s.standort_plz,
        paket: s.paket ?? 'standard',
        onboarding_anzahlung_betrag: Number(s.onboarding_anzahlung_betrag ?? 0),
        profile_email: s.profile_id ? profileMap.get(s.profile_id) ?? null : null,
      }))

      gesamtAnzahlung = subSvs.reduce((sum, s) => sum + s.onboarding_anzahlung_betrag, 0)
    }
  }

  // URL-Param ?step=stripe ueberschreibt den initial-Step (z.B. nach Stripe-Cancel)
  // KFZ-156: ?stripe_success=1 nach Stripe-Embed-Return → direkt auf Step 4 (Logo)
  const params = await searchParams
  let stepOverride: number | undefined
  if (params?.step === 'stripe') stepOverride = 2
  if (params?.stripe_success === '1') stepOverride = 3

  // KFZ-156: Stripe Publishable Key kommt aus dem Server (kein
  // NEXT_PUBLIC_-Var, da Vercel ihn nur als STRIPE_PUBLISHABLE_KEY hat).
  // Wir reichen ihn als Prop in den Client-Wizard.
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? ''

  const svRow = sv as typeof sv & { logo_url?: string | null }

  return (
    <WillkommenClient
      rolle={rolle}
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
        portal_zugang_freigeschaltet: !!sv.portal_zugang_freigeschaltet,
        logo_url: svRow.logo_url ?? null,
      }}
      profile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      organisation={organisation}
      subSvs={subSvs}
      gesamtAnzahlung={gesamtAnzahlung}
      nbVorlage={nbVorlage}
      kvVorlage={kvVorlage}
      stepOverride={stepOverride}
      stripePublishableKey={stripePublishableKey}
    />
  )
}
