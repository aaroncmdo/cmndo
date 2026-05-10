import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WillkommenClient from './WillkommenClient'
import WillkommenWaiting from './WillkommenWaiting'
import { resolveMaxFaelleMonat, resolveUmkreisKm } from '@/lib/sachverstaendige/kontingent'

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
  searchParams: Promise<{ step?: string; stripe_success?: string; session_id?: string; kalender_connected?: string }>
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
  // BUG-96: firmenname + steuernummer fuer die Stammdaten-Card im Vertrag-Step.
  // AAR-714: sa_vorlage_status/_admin_notiz entfernt — Wizard nutzt jetzt
  // pflichtdokumente (3 Slots) als Dispatch-Gate.
  const svSelect =
    'id, paket, paket_faelle_gesamt, paket_umkreis_km, onboarding_status, onboarding_anzahlung_betrag, vertrag_unterschrieben, portal_zugang_freigeschaltet, standort_adresse, standort_plz, organisation_id, rolle_in_organisation, logo_url, brand_primary, brand_secondary, use_custom_branding, firmenname, steuernummer, gcal_connected'
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)

  const allSvs = svRows ?? []

  if (!allSvs.length) {
    // Supabase-Propagierungs-Lag: Record wurde gerade vom Admin angelegt
    // und ist noch nicht auf dem Query-Pfad sichtbar. Statt Login-Error
    // kurz warten und Seite neu laden — nach 4 s ist die Row da.
    return <WillkommenWaiting />
  }

  // KFZ-152 Phase 2+3: Rolle ableiten + primaeren SV-Eintrag waehlen.
  // Community-Member wird NICHT mehr als sub_mitarbeiter behandelt — sie zahlen
  // selbst und bekommen den Solo-Flow mit Community-Banner. Akademie-Verwalter
  // ist eine neue Rolle (rolle='inhaber' AND org.typ='akademie').
  type Rolle = 'solo' | 'buero_inhaber' | 'akademie_verwalter' | 'sub_mitarbeiter' | 'community_member'
  const SUB_ROLLEN = new Set(['mitarbeiter', 'akademie_sub'])

  const inhaberSv = allSvs.find(s => (s.rolle_in_organisation ?? '').toLowerCase() === 'inhaber')
  const subSv = allSvs.find(s => SUB_ROLLEN.has((s.rolle_in_organisation ?? '').toLowerCase()))
  const communitySv = allSvs.find(s => (s.rolle_in_organisation ?? '').toLowerCase() === 'community_member')
  const soloSv = allSvs.find(s => !s.organisation_id)

  let rolle: Rolle
  let sv: (typeof allSvs)[number]
  if (inhaberSv) {
    // Default: buero_inhaber. Wird unten zu akademie_verwalter upgegradet
    // wenn org.typ='akademie'.
    rolle = 'buero_inhaber'
    sv = inhaberSv
  } else if (subSv) {
    rolle = 'sub_mitarbeiter'
    sv = subSv
  } else if (communitySv) {
    rolle = 'community_member'
    sv = communitySv
  } else if (soloSv) {
    rolle = 'solo'
    sv = soloSv
  } else {
    rolle = 'solo'
    sv = allSvs[0]
  }

  // KFZ-157: Wenn der User schon freigeschaltet ist, sind wir normalerweise
  // fertig. Eine Ausnahme: Solo + Inhaber, die zwar bezahlt haben, aber
  // noch kein Logo hochgeladen haben — die lassen wir Step 4 nochmal sehen.
  // Sub-Mitarbeiter sehen Step 4 NIE — sie erben das Branding der Org.
  const needsLogoStep =
    rolle !== 'sub_mitarbeiter' && !((sv as { logo_url?: string | null }).logo_url)
  // AAR-714: Gate wechselt vom Single-File SA-Vorlage auf Multi-Doc
  // Pflichtdokumente (Sicherungsabtretung ODER Honorarvereinbarung +
  // Datenschutzerklärung + Widerrufsbelehrung). Sub-Mitarbeiter laden
  // Pflichtdokumente weiter über /gutachter/verifizierung hoch.
  const PFLICHT_SLOTS = [
    'sv_sicherungsabtretung',
    'sv_honorarvereinbarung',
    'sv_datenschutzerklaerung',
    'sv_widerrufsbelehrung',
  ] as const
  const { data: pflichtdokumenteRows } = await supabase
    .from('pflichtdokumente')
    .select('dokument_typ, status, begruendung')
    .eq('sv_id', sv.id)
    .in('dokument_typ', PFLICHT_SLOTS as unknown as string[])

  const pflichtMap = new Map<string, { status: string; notiz: string | null }>()
  for (const r of pflichtdokumenteRows ?? []) {
    pflichtMap.set(r.dokument_typ as string, {
      status: (r.status as string) ?? 'ausstehend',
      notiz: (r.begruendung as string | null) ?? null,
    })
  }

  // AAR-717: CalDAV-Verbindungs-Status abfragen — zusätzlich zum Google-
  // Connect-Flag gcal_connected auf sachverstaendige. Entweder ein Google-
  // OAuth-Link oder eine CalDAV-Verbindung reicht als „Kalender verbunden".
  const { data: caldavRow } = await supabase
    .from('sv_kalender_verbindungen')
    .select('id')
    .eq('sv_id', sv.id)
    .eq('provider', 'caldav')
    .maybeSingle()
  const caldavConnected = !!caldavRow
  const isSlotFilled = (slot: string) => {
    const s = pflichtMap.get(slot)?.status
    return s === 'hochgeladen' || s === 'geprueft'
  }
  const hatAbtretung = isSlotFilled('sv_sicherungsabtretung') || isSlotFilled('sv_honorarvereinbarung')
  const hatDatenschutz = isSlotFilled('sv_datenschutzerklaerung')
  const hatWiderruf = isSlotFilled('sv_widerrufsbelehrung')
  const needsDokumenteStep =
    rolle !== 'sub_mitarbeiter' && !(hatAbtretung && hatDatenschutz && hatWiderruf)

  if (sv.portal_zugang_freigeschaltet && !needsLogoStep && !needsDokumenteStep) {
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
  // BUG-96: rechtsform + steuernummer fuer die Stammdaten-Card im Vertrag-Step
  // KFZ-152: + akademie_erst_anzahlung_eur fuer Akademie-Verwalter
  let organisation: { id: string; name: string; typ: string | null; onboarding_status: string | null; rechtsform: string | null; steuernummer: string | null; akademie_erst_anzahlung_eur: number | null } | null = null
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
      .select('id, name, typ, onboarding_status, rechtsform, steuernummer, akademie_erst_anzahlung_eur')
      .eq('id', sv.organisation_id)
      .maybeSingle()
    organisation = org ? {
      ...org,
      akademie_erst_anzahlung_eur: org.akademie_erst_anzahlung_eur != null ? Number(org.akademie_erst_anzahlung_eur) : null,
    } : null

    // KFZ-152 Phase 2: Akademie-Verwalter Upgrade. Wenn die Org eine Akademie
    // ist und der User rolle='inhaber' hat, ist er Akademie-Verwalter.
    if (rolle === 'buero_inhaber' && organisation?.typ === 'akademie') {
      rolle = 'akademie_verwalter'
    }

    if (rolle === 'buero_inhaber' || rolle === 'akademie_verwalter') {
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

    // KFZ-152 Phase 2: Akademie-Verwalter zahlt eine individuelle Erst-Anzahlung
    // (NICHT die Sub-Summen, die werden intern von der Akademie eingesammelt).
    if (rolle === 'akademie_verwalter') {
      gesamtAnzahlung = organisation?.akademie_erst_anzahlung_eur ?? 0
    }
  }

  // AAR-213: Lead-Preis-Tabelle laden für Overlay + ROI-Rechner im Wizard.
  const { data: leadpreiseRows } = await supabase
    .from('leadpreise_tabelle')
    .select('schadenhoehe_bis_netto, paketpreis_netto, einzelpreis_netto')
    .eq('aktiv', true)
    .order('schadenhoehe_bis_netto', { ascending: true })

  const leadpreise = (leadpreiseRows ?? []).map(r => ({
    schadenhoehe_bis_netto: Number(r.schadenhoehe_bis_netto),
    paketpreis_netto: Number(r.paketpreis_netto),
    einzelpreis_netto: Number(r.einzelpreis_netto),
  }))

  // URL-Param ?step=stripe ueberschreibt den initial-Step (z.B. nach Stripe-Cancel)
  // KFZ-156: ?stripe_success=1 nach Stripe-Embed-Return
  const params = await searchParams
  // AAR-359 W3 Step-Reihenfolge: konditionen=0, branding=1, vertrag=2,
  // anzahlung=3, sa_vorlage=4 (NEU), kalender=5.
  // ?step=stripe → Index 3; ?stripe_success → Index 4 (SA-Vorlage-Step).
  // ?kalender_connected=1 → Index 5 (Kalender-Step, Komponente zeigt den
  // Verbunden-State + Weiter-Button).
  let stepOverride: number | undefined
  if (params?.step === 'stripe') stepOverride = 3
  if (params?.stripe_success === '1') stepOverride = 4
  if (params?.kalender_connected === '1') stepOverride = 5

  // KFZ-156: Stripe Publishable Key kommt aus dem Server (kein
  // NEXT_PUBLIC_-Var, da Vercel ihn nur als STRIPE_PUBLISHABLE_KEY hat).
  // Wir reichen ihn als Prop in den Client-Wizard.
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? ''

  const svRow = sv as typeof sv & {
    logo_url?: string | null
    firmenname?: string | null
    steuernummer?: string | null
  }

  // AAR-714: Pflichtdokumente-States für den Wizard-Step.
  const dokumenteSlots = PFLICHT_SLOTS.map((slotId) => {
    const row = pflichtMap.get(slotId)
    const dbStatus = row?.status ?? null
    const status: 'leer' | 'hochgeladen' | 'geprueft' | 'abgelehnt' =
      dbStatus === 'hochgeladen' ? 'hochgeladen'
      : dbStatus === 'geprueft' ? 'geprueft'
      : dbStatus === 'abgelehnt' ? 'abgelehnt'
      : 'leer'
    return { slotId, status, adminNotiz: row?.notiz ?? null }
  })

  return (
    <WillkommenClient
      rolle={rolle}
      sv={{
        id: sv.id,
        paket: sv.paket ?? 'standard',
        paket_faelle_gesamt: resolveMaxFaelleMonat(sv),
        paket_umkreis_km: resolveUmkreisKm(sv),
        onboarding_anzahlung_betrag: Number(sv.onboarding_anzahlung_betrag ?? 0),
        onboarding_status: sv.onboarding_status,
        vertrag_unterschrieben: !!sv.vertrag_unterschrieben,
        standort_adresse: sv.standort_adresse,
        standort_plz: sv.standort_plz,
        rolle_in_organisation: sv.rolle_in_organisation,
        portal_zugang_freigeschaltet: !!sv.portal_zugang_freigeschaltet,
        logo_url: svRow.logo_url ?? null,
        // BUG-96: fuer die Stammdaten-Card im Vertrag-Step
        firmenname: svRow.firmenname ?? null,
        steuernummer: svRow.steuernummer ?? null,
        // AAR-242: Kalender-Status für den Kalender-Step
        gcal_connected: !!(sv as { gcal_connected?: boolean }).gcal_connected,
        // AAR-717: CalDAV-Verbindung (alternativ zu Google)
        caldav_connected: caldavConnected,
        // AAR-714: Pflichtdokumente-States
        dokumenteSlots,
        dokumenteKomplett: hatAbtretung && hatDatenschutz && hatWiderruf,
      }}
      profile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      organisation={organisation}
      subSvs={subSvs}
      gesamtAnzahlung={gesamtAnzahlung}
      nbVorlage={nbVorlage}
      kvVorlage={kvVorlage}
      stepOverride={stepOverride}
      stripePublishableKey={stripePublishableKey}
      leadpreise={leadpreise}
    />
  )
}
