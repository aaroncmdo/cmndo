import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import FlowWizardKfz from './FlowWizardKfz'
import FokusSignaturClient from './FokusSignaturClient'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import WerkstattIntakeSignatur from './WerkstattIntakeSignatur'
import { brauchtWerkstattVermittlung, type BedarfRow } from '@/lib/werkstatt/vermittlung-core'
import { ladeFlowWeichen } from '@/lib/self-service/lade-flow-szenarien'
import type { LeadFuerKontext } from '@/lib/self-service/flow-kontext'
import LeadRealtimeRefresh from '@/components/shared/LeadRealtimeRefresh'
import { getAllLegalDocs } from '@/lib/legal/get-doc'
// AAR-316 W2: Sprach-Banner für nicht-deutsche Kunden
import { SprachBanner } from '@/components/i18n/SprachBanner'
// AAR-branding-rest: SV-Branding über den FlowLink-Token resolven → 27-Var-Wrapper
import { resolveBrandingFromFlowToken } from '@/lib/branding/token-theme'
import { generateCssVars } from '@/lib/branding/css-vars'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { resolveFlowLocale } from '@/lib/i18n/resolve-flow-locale'
import { loadMessages } from '@/i18n/load-messages'
import { ladeFlowPhasen } from '@/lib/onboarding/lade-flow-phasen'
import { getStorageUrl } from '@/lib/storage/url'
import type { SupabaseClient } from '@supabase/supabase-js'

// AAR-604: Kein try/catch um JSX-Returns — Next.js fängt Render-Errors via
// error.tsx (AAR-271) als Error-Boundary. Das umschließende try/catch davor
// hat 13 Lint-Errors (react-hooks/error-boundaries) produziert und konnte
// Render-Errors sowieso nicht fangen, da React JSX lazy auswertet.

// AAR-360 Follow-up: SV-Datenschutz + Widerrufsbelehrung als Signed-URLs laden
// (pflichtdokumente-Slots), damit der Kunde im FlowLink-Häkchen lesen kann, wozu er
// zustimmt. Non-critical: fehlt ein Dokument -> null (Häkchen ohne toten Link).
async function loadSvConsentDocUrls(
  svc: SupabaseClient,
  svId: string,
): Promise<{ datenschutzUrl: string | null; widerrufUrl: string | null }> {
  const { data: rows } = await svc
    .from('pflichtdokumente')
    .select('dokument_typ, dokument_url, status')
    .eq('sv_id', svId)
    .in('dokument_typ', ['sv_datenschutzerklaerung', 'sv_widerrufsbelehrung'])
  let datenschutzUrl: string | null = null
  let widerrufUrl: string | null = null
  for (const r of rows ?? []) {
    const status = (r.status as string | null) ?? null
    const path = (r.dokument_url as string | null) ?? null
    if (!path || (status !== 'hochgeladen' && status !== 'geprueft')) continue
    const url = await getStorageUrl(svc, 'fall-dokumente', path)
    if (r.dokument_typ === 'sv_datenschutzerklaerung') datenschutzUrl = url
    else if (r.dokument_typ === 'sv_widerrufsbelehrung') widerrufUrl = url
  }
  return { datenschutzUrl, widerrufUrl }
}

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const svc = createServiceClient()

  // 1. Look up flow_links by token + check expiry (BUG-100)
  // AAR-316: sprache mitladen für Sprach-Banner (Google-Translate-Fallback)
  const { data: flowLink } = await svc
    .from('flow_links')
    .select('id, lead_id, status, geoeffnet_am, expires_at, sprache')
    .eq('token', token)
    .maybeSingle()

  // AAR-branding-rest: SV-Branding aus dem Token resolven — Kunde sieht im
  // FlowLink das Branding seines (verifizierten, branded) SVs. Greift kein
  // Brand → Claimondo-Default (Gate in token-theme.ts).
  const branding = await resolveBrandingFromFlowToken(token)
  const brandStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined

  // Fallback: Try token as lead_id directly (backward compat)
  let leadId: string
  let flowLinkId: string | null = null

  if (flowLink) {
    // i18n Strategie B: Locale für die Pre-Wizard-Screens aus dem Token auflösen.
    // Hier ist der Lead noch nicht geladen — flow_links.sprache ist ohnehin die
    // höchstpriorisierte Quelle (resolveFlowLocale), daher genügt das.
    const preLocale = resolveFlowLocale(flowLink.sprache as string | null, null)
    const tPre = await getTranslations({ locale: preLocale, namespace: 'flow' })

    // BUG-100: Token-Expiry prüfen
    if (flowLink.expires_at && new Date(flowLink.expires_at) < new Date()) {
      return (
        <div style={brandStyle} dir={preLocale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
          <div className="bg-white rounded-ios-md shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x23F3;</div>
            <h1 className="text-xl font-bold text-claimondo-navy mb-2">{tPre('expired.heading')}</h1>
            <p className="text-claimondo-ondo">{tPre('expired.body')}</p>
          </div>
        </div>
      )
    }

    // CMM-14 + AAR-956 16.06. (Aaron): FlowLink schon verbraucht (Reload nach
    // Konvertierung) → nur eine "wir melden uns"-Bestätigung. KEIN Login-/Portal-Button
    // am Ende (konsistent mit dem Account-Step; Claim-/Onboarding-Portal kommt separat).
    if (flowLink.status === 'abgeschlossen') {
      return (
        <div style={brandStyle} dir={preLocale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
          <div className="bg-white rounded-ios-md shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x2705;</div>
            <h1 className="text-xl font-bold text-claimondo-navy mb-2">{tPre('done.heading')}</h1>
            <p className="text-claimondo-ondo">
              {tPre('done.body')}
            </p>
          </div>
        </div>
      )
    }

    leadId = flowLink.lead_id
    flowLinkId = flowLink.id

    // Mark as opened if first visit
    if (!flowLink.geoeffnet_am) {
      await svc.from('flow_links').update({ geoeffnet_am: new Date().toISOString(), status: 'geoeffnet' }).eq('id', flowLink.id)
      await svc.from('leads').update({ flow_link_geoeffnet: true, updated_at: new Date().toISOString() }).eq('id', leadId)

      // AAR-229 W4: Mitteilung an zugewiesenen MA + SV
      try {
        // CMM-49 (faelle-Drop-Runway): lead_id->fall via v_claim_full (flat, faelle-frei). fall_id==faelle.id.
        const { data: zugehFall } = await svc.from('v_claim_full').select('fall_id, sv_id').eq('lead_id', leadId).limit(1).maybeSingle()
        const { data: leadForName } = await svc.from('leads').select('vorname, nachname, zugewiesen_an').eq('id', leadId).single()
        const name = [leadForName?.vorname, leadForName?.nachname].filter(Boolean).join(' ') || 'Kunde'
        const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
        const empfaenger: Array<{ id: string; rolle: 'admin' | 'sachverstaendiger' }> = []
        if (leadForName?.zugewiesen_an) empfaenger.push({ id: leadForName.zugewiesen_an, rolle: 'admin' })
        if (zugehFall?.sv_id) {
          const { data: svP } = await svc.from('sachverstaendige').select('profile_id').eq('id', zugehFall.sv_id).single()
          if (svP?.profile_id) empfaenger.push({ id: svP.profile_id, rolle: 'sachverstaendiger' })
        }
        if (empfaenger.length) {
          await createMitteilungMulti(empfaenger, {
            kategorie: 'update',
            titel: 'Kunde hat FlowLink geöffnet',
            inhalt: name,
            kontext_typ: 'fall',
            kontext_id: zugehFall?.fall_id,
          })
        }
      } catch { /* non-critical */ }
    }

    // KFZ-207: Auto-Reaktivierung kalt-Lead wenn FlowLink geöffnet wird
    const { data: lead } = await svc.from('leads').select('qualifizierungs_phase, vorname, nachname').eq('id', leadId).single()
    if (lead?.qualifizierungs_phase === 'kalt') {
      await svc.from('leads').update({ qualifizierungs_phase: 'in-qualifizierung', updated_at: new Date().toISOString() }).eq('id', leadId)
      const { data: linkedFall } = await svc.from('v_claim_full').select('fall_id').eq('lead_id', leadId).limit(1).maybeSingle()
      const fallId = linkedFall?.fall_id ?? null
      await svc.from('tasks').insert({ fall_id: fallId, titel: `Lead reaktiviert: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (FlowLink geöffnet)`, typ: 'dispatch', prioritaet: 'dringend', status: 'offen' })
      if (fallId) {
        await svc.from('timeline').insert({ fall_id: fallId, typ: 'system', titel: 'Lead reaktiviert (FlowLink geöffnet)', beschreibung: `${lead.vorname ?? ''} ${lead.nachname ?? ''} war kalt, hat sich selbst reaktiviert.` })
      }
    }
  } else {
    // Backward compat: token might be lead_id
    leadId = token
  }

  // 2. Load lead data (extended for KFZ-117 FlowLink flow)
  // AAR-71: SELECT * statt hardcoded Liste — verhindert dass neue Felder
  // (Halter, Leasing/Finanzierung, Vorschaeden, Schadenkonstellation) verloren gehen
  const { data: lead } = await svc
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return notFound()

  // i18n: Empfaenger-Locale + Messages FRUEH aufloesen (haengt nur an flowLink/lead.sprache),
  // damit der Werkstatt-Intake-Branch sie nutzen kann. (AAR-316; frueher weiter unten)
  const sprache = (flowLink?.sprache as string | null) ?? (lead.sprache as string | null) ?? 'de'
  const flowLocale = resolveFlowLocale(flowLink?.sprache as string | null, lead.sprache as string | null)
  const flowMessages = await loadMessages(flowLocale)

  // Werkstatt-getriebener Intake (Haftpflicht): die Werkstatt hat die Falldaten gefuellt,
  // der Kunde unterschreibt nur die SA (Signatur-only). Kurzschluss VOR der Termin-/
  // Gutachter-/Feststellungs-Logik — die braucht der Intake-Pfad nicht. Expiry- +
  // 'abgeschlossen'-Checks liefen bereits oben (im flowLink-Block).
  if (lead.werkstatt_intake_am) {
    return (
      <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
        <LeadRealtimeRefresh leadId={lead.id} />
        <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
          <WerkstattIntakeSignatur
            token={token}
            leadId={leadId}
            flowLinkId={flowLinkId}
            legalDocs={getAllLegalDocs()}
            zusammenfassung={{
              vorname: lead.vorname ?? '',
              nachname: lead.nachname ?? '',
              fahrzeug: [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' '),
              kennzeichen: lead.kennzeichen ?? '',
              unfalldatum: lead.unfalldatum ?? null,
              unfallort: lead.unfallort ?? null,
              unfallhergang: lead.unfallhergang ?? null,
              gegnerName: lead.gegner_name ?? null,
              gegnerVersicherung: lead.gegner_versicherung ?? null,
            }}
            kundeEmail={lead.email ?? ''}
            kundeVorname={lead.vorname ?? ''}
            kundeNachname={lead.nachname ?? ''}
            kundeTelefon={lead.telefon ?? ''}
          />
        </NextIntlClientProvider>
      </div>
    )
  }

  // 2026-05-12 Funnel v2 PR #5: eingeloggter Kunde mit bestehendem Fall -> datengetriebenes
  // /kunde/onboarding-details. Das ist die KANONISCHE Strecke fuer eingeloggte Kunden (Aaron 27.07.:
  // ersetzt FlowWizardKfz; der bleibt Fallback fuer Token-Magic-Links OHNE Login).
  // AAR-956 (Marker #1): AUSSER der Fall ist ein SA-Weg und noch UNSIGNIERT (sa_unterschrieben=false)
  // -> onboarding-details enthaelt keine SA-Signatur -> dann den fokussierten SaSignaturStep rendern.
  // 27.07. (FlowLink-Audit): der redirect() lag frueher IM try -> der NEXT_REDIRECT-Throw wurde vom
  // Catch verschluckt (kein isRedirectError-Re-throw, vgl. kunde/page.tsx:244) -> er lief NIE;
  // eingeloggte Kunden fielen faelschlich in den Legacy-FlowWizardKfz (= die "zweite Feststellung").
  // Fix: beide Ausgaenge MERKEN + AUSSERHALB des try feuern (dort schluckt kein catch den Throw).
  let signaturBenoetigtFallId: string | null = null
  let onboardingRedirectFallId: string | null = null
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (user) {
      const { data: fallFuerKunde } = await svc
        .from('v_claim_full')
        .select('fall_id, kunde_id, sa_unterschrieben, abrechnungsweg')
        .eq('lead_id', leadId)
        .eq('kunde_id', user.id)
        .limit(1)
        .maybeSingle()
      if (fallFuerKunde?.fall_id) {
        const brauchtSignatur =
          fallFuerKunde.sa_unterschrieben === false &&
          !istWerkstattReparaturWeg((fallFuerKunde.abrechnungsweg as string | null) ?? null)
        if (brauchtSignatur) {
          signaturBenoetigtFallId = fallFuerKunde.fall_id as string
        } else {
          onboardingRedirectFallId = fallFuerKunde.fall_id as string
        }
      }
    }
  } catch (err) {
    // Auth-Check soll nie die FlowWizardKfz-Anzeige blockieren — bei
    // Fehler fallen wir auf den Legacy-Pfad zurueck.
    console.warn('[flow/[token]] Auth-Check fuer Onboarding-Redirect:', err)
  }
  // Kanonisch (s.o.): eingeloggter Kunde + Fall + SA erledigt -> onboarding-details. AUSSERHALB des
  // try, damit NEXT_REDIRECT propagiert. Eine offene Feststellung wird DORT erhoben (datenabhaengig,
  // ladeNoetigePhasen 'kunde-onboarding' -> claims.hergang_kunde_text; Bridge convertLeadToClaim
  // kopiert leads.unfallhergang -> claims.hergang_kunde_text, also kein Doppel-Ask auf dem SA-Pfad).
  if (onboardingRedirectFallId) {
    redirect(`/kunde/onboarding-details?fall_id=${onboardingRedirectFallId}`)
  }
  if (signaturBenoetigtFallId) {
    return (
      <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
        <LeadRealtimeRefresh leadId={lead.id} />
        <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
          <FokusSignaturClient
            token={token}
            leadId={leadId}
            flowLinkId={flowLinkId}
            legalDocs={getAllLegalDocs()}
            fallId={signaturBenoetigtFallId}
          />
        </NextIntlClientProvider>
      </div>
    )
  }

  // AAR-99: Reservierten SV+Termin laden fuer Schritt 2
  const { data: terminMitSv } = await svc
    .from('gutachter_termine')
    .select('id, start_zeit, assignee_id, assignee_typ, status')
    // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL) -> Dual-Lookup mitfinden.
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()

  // AAR-956 16.06. (Aaron Wunschtermin-Modell): Wenn KEIN harter Termin (mehr) existiert
  // (verfallen/Buchung fehlgeschlagen), die Anfrage aber einen gewählten SV + Wunschtermin
  // trägt, zwingen wir den Kunden NICHT zur Neu-Buchung — er sieht "Wunschtermin wird
  // bestätigt" (Dispatch finalisiert den Slot). Nur ohne SV-Pick UND ohne Wunschtermin
  // bleibt die Buchung Pflicht. Schmaler Gate: trifft genau den Re-Select-Bug.
  const wunschterminIso = (lead.wunschtermin as string | null) ?? null
  let chosenSvId: string | null = null
  if (!terminMitSv) {
    const { data: gfaPick } = await svc
      .from('gutachter_finder_anfragen')
      .select('zugeordneter_sv_id')
      .eq('konvertiert_zu_lead_id', leadId)
      .order('erstellt_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    chosenSvId = (gfaPick?.zugeordneter_sv_id as string | null) ?? null
  }
  const terminPending = !terminMitSv && chosenSvId != null && wunschterminIso != null

  // Die DB-getriebene Weiche (Aaron 14.07.: "komplett db driven, damit es wiederverwendbar ist").
  // Die Matrix (welche Szenarien, welche Steps, welche Bedingungen) liegt in flow_szenarien +
  // flow_szenario_steps; hier wird sie geladen und gegen den Lead-Zustand ausgewertet. Ein neuer Weg
  // oder eine neue Weiche ist damit eine ZEILE, kein Deploy.
  // Der Lead kommt via select('*') -> alle Felder liegen vor (auch die, die frueher nie an den Client gingen).
  const { config: flowConfig, weichen } = await ladeFlowWeichen(
    lead as unknown as LeadFuerKontext,
    Boolean(terminMitSv) || terminPending,
  )

  // AAR-956 §3a: termin-loser Self-Service-Lead → datengetriebener incomplete-Pfad, flag-gegatet.
  //
  // Aaron 14.07.: Die Gates FOLGEN jetzt der DB-Config — `weichen.steps` ist die Wahrheit. Vorher war
  // needsBooking REIN terminzustands-gegatet und fragte nie nach dem Abrechnungsweg; Kasko/Selbstzahler
  // fielen nur zufaellig heraus (ueber den Quali-Short-Circuit, der NICHT greift, wenn die schuldfrage
  // schon gesetzt hereinkommt). Ergebnis: ein Kasko-Kunde sah den Gutachter-Finder ("loses Ende").
  // Jetzt: steht 'termin' in der Step-Sequenz des Szenarios, braucht der Kunde einen Gutachter — sonst nicht.
  // Die Termin-/Werkstatt-Zustandsfilter stecken als Bedingungen IN der Config ({"sv_id": null} usw.).
  // Rollout-Flag-Haertung (27.07.): der DB-getriebene Flow (Feststellung/Booking/Werkstatt) ist auf
  // Prod LIVE — Anon-Smoke 27.07. verifiziert: /flow Step 2 = "Schaden"/Feststellung mit 11 Sub-Steps.
  // Der Gate-Flag CANONICAL_FLOWLINK_ENABLED='true' steht in der VPS-Env, aber in KEINER Repo-.env ->
  // ein Env-Refresh, der ihn droppt, wuerde die Feststellung fuer ALLE Wege still abschalten (kein
  // Build/tsc faengt das). Default-ON (=== 'true' -> !== 'false') macht das resilient; No-op auf Prod
  // (Flag ist 'true'). Not-Aus bleibt via CANONICAL_FLOWLINK_ENABLED='false'.
  const flowConfigAktiv = process.env.CANONICAL_FLOWLINK_ENABLED !== 'false'
  const needsBooking = flowConfigAktiv && weichen.brauchtGutachter
  // AAR-956 self-service (Aaron 14.06.): ① Feststellung ist FAKTEN-gegatet, nicht termin-gegatet.
  // Ein Embed-Lead hat einen gebuchten Termin ABER noch keinen unfallhergang → die Feststellung
  // soll laufen. Die Bedingung dafuer steht in der Config (erhebt_felder) und ist PRO SZENARIO
  // unterschiedlich: Haftpflicht prueft `unfallhergang`, Kasko/Selbstzahler `fahrzeugschaden_beschreibung`
  // (dort gibt es keinen Unfall — die Feststellung fragt den Schaden fuers Werkstatt-Matching ab).

  // Werkstatt-Picker: die Config sagt, ob der Weg ueberhaupt eine Werkstatt vorsieht (kasko/selbstzahler
  // sofort, haftpflicht nach dem Gutachten, nie bei nur_gutachter/Teilschuld) — brauchtWerkstattVermittlung
  // bleibt als fachlicher Zusatz-Check (Reparaturwunsch gesetzt, Vermittlung noch offen).
  const needsWerkstatt =
    flowConfigAktiv &&
    weichen.brauchtWerkstatt &&
    brauchtWerkstattVermittlung(lead as unknown as BedarfRow)

  // Prefill (Aaron 24.07., FlowLink-Lane): FM-initiierter Lead (source_channel='flotte-manuell')
  // → Firma-Adresse als editierbarer DEFAULT fuer die Ort-Steps. Die Roh-Spalte wird bewusst NICHT
  // gesetzt (sonst filtert erhebtNoch den ort-Step raus = keine Edit-Flaeche) — nur der Prefill-/
  // Anzeige-Wert bekommt sie. Nur laden, wenn noch KEIN konkreter Ort da ist.
  let firmaAdresse: string | null = null
  if (
    (lead.source_channel as string | null) === 'flotte-manuell' &&
    (lead.vehicle_id as string | null) &&
    !lead.besichtigungsort_adresse &&
    !lead.fahrzeug_standort_adresse
  ) {
    const { data: ff } = await svc
      .from('flotten_fahrzeuge')
      .select('firma_id')
      .eq('vehicle_id', lead.vehicle_id as string)
      .maybeSingle()
    const firmaId = (ff?.firma_id as string | null) ?? null
    if (firmaId) {
      const { data: firma } = await svc
        .from('firmen')
        .select('adresse_strasse, adresse_plz, adresse_ort')
        .eq('id', firmaId)
        .maybeSingle()
      firmaAdresse =
        [firma?.adresse_strasse, [firma?.adresse_plz, firma?.adresse_ort].filter(Boolean).join(' ')]
          .filter((t: string | null | undefined) => t && String(t).trim())
          .join(', ') || null
    }
  }

  // Besichtigungsort im FlowWizard Schritt 2: primär besichtigungsort_adresse
  // (Dispatch setzt den konkreten Inspektions-Ort), Fallback fahrzeug_standort, dann unfallort,
  // zuletzt die Firma-Adresse (FM-Lead-Prefill). Eine Quelle für gutachter-Prop + §3a-Anzeige +
  // ort-Step-Prefill (FlowOrtStep.initialAdresse).
  const besichtigungsAdresse =
    (lead.besichtigungsort_adresse as string | null) ??
    (lead.fahrzeug_standort_adresse as string | null) ??
    (lead.unfallort as string | null) ??
    firmaAdresse ??
    null

  // AAR-956 P4-A: ① Feststellung — lead-erfassung(kunde)-Phasen + aktuelle Lead-Werte.
  // Werte feld_key -> aktueller leads-Wert (Boolean -> String fuer segmented/toggle-cards;
  // Action coercet zurueck).
  // AAR-956 16.06. (Aaron): die lead-erfassung(kunde)-Config IMMER laden — daraus speist sich
  // (a) die Feststellung UND (b) die Service-/Kanzlei-Wahl im SA-/POS-Step.
  // Prod-Incident 29.07. (Aaron, Gutachter-Finder-Termin ohne Feststellung): die Phasen duerfen
  // NICHT am Mount-Szenario gegatet werden (frueher `weichen.steps.includes('feststellung')`).
  // Ein unqualifizierter Lead (nativer Finder fragt keine Schuldfrage) mountet im Quali-Szenario
  // OHNE feststellung-Step -> feststellungPhasen=[] -> FlowWizardKfz friert
  // initialHatFeststellung=false ein -> nach der Quali-Antwort filtert nurVorhandeneFeststellung
  // den Step aus der neuen Haftpflicht-Sequenz -> Kunde erzaehlt NIE den Unfallhergang.
  // Die Sichtbarkeit des Steps regeln weichen.steps (SSR) bzw. uebernimmSzenario (Client) —
  // die Felder-Config muss dafuer nur VERFUEGBAR sein.
  const allKundeConfig = await ladeFlowPhasen('lead-erfassung', 'kunde')
  const feststellungPhasen = allKundeConfig
  const leseFeldWert = (spalte: string | undefined): unknown => {
    if (spalte && spalte in (lead as Record<string, unknown>)) {
      const v = (lead as Record<string, unknown>)[spalte]
      return typeof v === 'boolean' ? String(v) : v
    }
    return undefined
  }
  const feststellungWerte: Record<string, unknown> = {}
  for (const phase of feststellungPhasen) {
    for (const feld of phase.felder) {
      const v = leseFeldWert(feld.db_target?.spalte)
      if (v !== undefined) feststellungWerte[feld.feld_key] = v
    }
  }
  // Service-Feld (service_typ) + Werte fuer den SA-/POS-Step. kanzlei_wunsch wird
  // im Flow/Lead NICHT mehr gefragt (Aaron): Komplettservice = LexDrive immer;
  // convert-lead-to-claim setzt komplett -> 'partnerkanzlei'. Die Kanzlei-Wahl
  // (eigene Kanzlei) lebt nur auf Claim-Ebene (KanzleiWunschModal im Portal).
  const serviceFelder = allKundeConfig
    .flatMap((p) => p.felder)
    .filter((f) => f.feld_key === 'service_typ')
  const serviceWerte: Record<string, unknown> = {}
  for (const f of serviceFelder) {
    const v = leseFeldWert(f.db_target?.spalte)
    if (v !== undefined) serviceWerte[f.feld_key] = v
  }
  // AAR-956 Gebiet-3: Polizeibericht-Status (KEIN Config-Feld) fuer die dynamic-display des
  // Upload-Blocks — FlowPolizeiberichtUpload zeigt "liegt vor" statt erneut zu prompten (Reload/
  // Dispatcher-Upload). speichereFeststellungFlow ignoriert Nicht-Config-Keys.
  feststellungWerte['polizeibericht_status'] = (lead.polizeibericht_status as string | null) ?? null

  // AAR-956 Auto-Beratungstermin: aktiven kb_beratung-Termin des Leads + KB-Vorname laden.
  // Termin-Engine-Contract: ueber den sanktionierten Dual-Lookup-Helper (findet auch
  // bezug-native Termine, #2580), nicht direkt mit .eq('lead_id') (CONTRACT.md).
  let beratungstermin: { id: string; startZeit: string; status: string; kbVorname: string | null } | null = null
  {
    const { findeBeratungsterminFuerLead } = await import('@/lib/termine/finde-termin-fuer-lead')
    const bt = await findeBeratungsterminFuerLead(svc, leadId)
    if (bt) {
      let kbVorname: string | null = null
      if (bt.assignee_id) {
        const { data: kb } = await svc.from('profiles').select('vorname').eq('id', bt.assignee_id).maybeSingle()
        kbVorname = (kb?.vorname as string | null) ?? null
      }
      beratungstermin = { id: bt.id, startZeit: bt.start_zeit, status: bt.status, kbVorname }
    }
  }

  let gutachter: {
    vorname: string
    avatarUrl: string | null
    firma: string | null
    terminDatum: string | null
    besichtigungsAdresse: string | null
    svTreffpunkt: string | null
    googleDurchschnitt: number | null
    googleAnzahl: number | null
    googleAktualisiertAm: string | null
    terminStatus: string | null
    // AAR-360 Follow-up: SV-Datenschutz + Widerruf (Signed-URLs) für das Consent-Häkchen
    datenschutzUrl: string | null
    widerrufUrl: string | null
  } | null = null
  // CMM-49 sv_id-Drop: FK-Embed sachverstaendige(...) haengt an der zu droppenden
  // sv_id-FK → assignee_id-Lookup (typ-guarded, value-identisch fuer SV-Termine).
  const svReserviert =
    terminMitSv?.assignee_typ === 'sachverstaendiger' && terminMitSv.assignee_id
      ? (
          await svc
            .from('sachverstaendige')
            .select('profile_id, firmenname, profiles!sachverstaendige_profile_id_fkey(vorname, avatar_url, firma)')
            .eq('id', terminMitSv.assignee_id)
            .maybeSingle()
        ).data
      : null
  if (svReserviert) {
    const profile = svReserviert.profiles as { vorname: string | null; avatar_url: string | null; firma: string | null } | { vorname: string | null; avatar_url: string | null; firma: string | null }[] | null
    const profileRow = Array.isArray(profile) ? profile[0] : profile
    const svProfileId = svReserviert.profile_id as string | null | undefined

    // Google-Bewertungs-Cache (CMM-31) für die SV-Profil-ID laden — non-critical
    let googleDurchschnitt: number | null = null
    let googleAnzahl: number | null = null
    let googleAktualisiertAm: string | null = null
    if (svProfileId) {
      const { data: gb } = await svc
        .from('google_bewertungen_cache')
        .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
        .eq('profile_id', svProfileId)
        .maybeSingle()
      if (gb) {
        googleDurchschnitt = (gb.durchschnitt as number | null) ?? null
        googleAnzahl = (gb.anzahl_bewertungen as number | null) ?? null
        googleAktualisiertAm = (gb.zuletzt_aktualisiert_am as string | null) ?? null
      }
    }

    // AAR-956 19.06. (Aaron-Bug): Gutachter-Finder-SVs haben oft keinen profiles.vorname
    // (nur firmenname) → Fallback auf firmenname statt gutachter=null ("kein_gutachter").
    const anzeigeName = profileRow?.vorname ?? (svReserviert.firmenname as string | null) ?? null
    if (anzeigeName) {
      // AAR-360 Follow-up: SV-Datenschutz/Widerruf-URLs für das Consent-Häkchen laden.
      const svDocs = await loadSvConsentDocUrls(svc, terminMitSv!.assignee_id as string)
      gutachter = {
        vorname: anzeigeName,
        avatarUrl: profileRow?.avatar_url ?? null,
        firma: profileRow?.firma ?? null,
        terminDatum: (terminMitSv?.start_zeit as string | null) ?? null,
        besichtigungsAdresse,
        svTreffpunkt: (lead.besichtigungsort_notiz as string | null) ?? null,
        googleDurchschnitt,
        googleAnzahl,
        googleAktualisiertAm,
        terminStatus: (terminMitSv?.status as string | null) ?? null,
        datenschutzUrl: svDocs.datenschutzUrl,
        widerrufUrl: svDocs.widerrufUrl,
      }
    }
  }

  // AAR-956 16.06. (Aaron): kein harter Termin, aber gewählter SV + Wunschtermin →
  // den gewählten SV laden + den Wunschtermin als (noch zu bestätigendes) Datum zeigen.
  // Spiegelt das svReserviert-Profil-/Google-Pattern oben (chosenSvId statt assignee_id).
  if (!gutachter && terminPending && chosenSvId) {
    const { data: svPick } = await svc
      .from('sachverstaendige')
      .select('profile_id, firmenname, profiles!sachverstaendige_profile_id_fkey(vorname, avatar_url, firma)')
      .eq('id', chosenSvId)
      .maybeSingle()
    if (svPick) {
      const p = svPick.profiles as
        | { vorname: string | null; avatar_url: string | null; firma: string | null }
        | { vorname: string | null; avatar_url: string | null; firma: string | null }[]
        | null
      const pr = Array.isArray(p) ? p[0] : p
      const svPid = svPick.profile_id as string | null | undefined
      let gd: number | null = null
      let ga: number | null = null
      let gaa: string | null = null
      if (svPid) {
        const { data: gb } = await svc
          .from('google_bewertungen_cache')
          .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
          .eq('profile_id', svPid)
          .maybeSingle()
        if (gb) {
          gd = (gb.durchschnitt as number | null) ?? null
          ga = (gb.anzahl_bewertungen as number | null) ?? null
          gaa = (gb.zuletzt_aktualisiert_am as string | null) ?? null
        }
      }
      const pickName = pr?.vorname ?? (svPick.firmenname as string | null) ?? null
      if (pickName) {
        // AAR-360 Follow-up: SV-Datenschutz/Widerruf-URLs für das Consent-Häkchen laden.
        const svDocs = await loadSvConsentDocUrls(svc, chosenSvId)
        gutachter = {
          vorname: pickName,
          avatarUrl: pr?.avatar_url ?? null,
          firma: pr?.firma ?? null,
          terminDatum: wunschterminIso,
          besichtigungsAdresse,
          svTreffpunkt: (lead.besichtigungsort_notiz as string | null) ?? null,
          googleDurchschnitt: gd,
          googleAnzahl: ga,
          googleAktualisiertAm: gaa,
          terminStatus: null, // Wunschtermin = noch kein harter Termin
          datenschutzUrl: svDocs.datenschutzUrl,
          widerrufUrl: svDocs.widerrufUrl,
        }
      }
    }
  }

  // sprache/flowLocale/flowMessages: bereits FRUEH aufgeloest (oben, vor dem
  // Werkstatt-Intake-Branch) — hier nur noch genutzt.

  return (
    <div style={brandStyle} dir={flowLocale === 'ar' ? 'rtl' : 'ltr'}>
      {/* AAR-956 Self-Service #3b: Live-Refresh der /flow-Seite. Anon-Client
          empfaengt leads-UPDATE via "Flow anon select leads" (status=flow-gesendet)
          + leads REPLICA IDENTITY FULL. Server-Props (reservierter SV/Termin,
          besichtigungsort) ziehen nach; lokaler Wizard-Input bleibt erhalten. */}
      <LeadRealtimeRefresh leadId={lead.id} />
      {/* Banner nur noch als Rest-Fallback: wenn KEINE echte Übersetzung greift
          (flowLocale='de') der Empfänger aber nicht-deutsch ist ('other'/unbekannt). */}
      <SprachBanner
        sprache={
          flowLocale === 'de' && sprache !== 'de'
            ? (sprache as Parameters<typeof SprachBanner>[0]['sprache'])
            : null
        }
      />
      {/* Scoped Provider: ueberschreibt die globale Cookie-Locale nur fuer den
          Flow-Subtree. timeZone wird vom globalen Provider geerbt (request.ts
          setzt keine). Consumer (useTranslations) kommen in P2 in FlowWizardKfz. */}
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <FlowWizardKfz
          token={token}
          flowLinkId={flowLinkId}
          gutachter={gutachter}
          needsBooking={needsBooking}
          needsWerkstatt={needsWerkstatt}
          weichen={weichen}
          // Die Matrix mitgeben: waehlt der Kunde die Schuldfrage erst im Quali-Step, wechselt das
          // Szenario (unqualifiziert -> kasko/haftpflicht/teilschuld) und der Wizard muss die
          // Step-Sequenz neu berechnen — ohne Server-Roundtrip.
          flowConfig={flowConfig}
          hatSvTermin={Boolean(terminMitSv) || terminPending}
          terminPending={terminPending}
          besichtigungsAdresse={besichtigungsAdresse}
          feststellungPhasen={feststellungPhasen}
          feststellungWerte={feststellungWerte}
          serviceFelder={serviceFelder}
          serviceWerte={serviceWerte}
          lead={{
            id: lead.id,
            vorname: lead.vorname ?? '',
            nachname: lead.nachname ?? '',
            email: lead.email ?? '',
            telefon: lead.telefon ?? '',
            schadens_fall_typ: lead.schadens_fall_typ ?? 'sf-01',
            schadentyp: lead.schadentyp ?? null,
            schadentyp_freitext: lead.schadentyp_freitext ?? null,
            kunden_konstellation: lead.kunden_konstellation ?? 'kk-01',
            personenschaden_flag: lead.personenschaden_flag ?? false,
            mietwagen_flag: lead.mietwagen_flag ?? false,
            polizeibericht_pflicht: lead.polizeibericht_pflicht ?? false,
            polizei_vor_ort: lead.polizei_vor_ort ?? false,
            gutachter_termin: lead.gutachter_termin ?? null,
            kennzeichen: lead.kennzeichen ?? '',
            fahrzeug_hersteller: lead.fahrzeug_hersteller ?? '',
            fahrzeug_modell: lead.fahrzeug_modell ?? '',
            fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? '',
            fahrzeug_standort_plz: lead.fahrzeug_standort_plz ?? '',
            gegner_name: lead.gegner_name ?? '',
            gegner_versicherung: lead.gegner_versicherung ?? '',
            unfallhergang: lead.unfallhergang ?? '',
            // AAR-305: steuert Mietwagen-Empfehlungs-Box im neuen Step „Weitere Angaben"
            fahrzeug_fahrbereit: lead.fahrzeug_fahrbereit ?? null,
            // AAR-336: Schritt 1 als Review-Ansicht — Dispatch-Werte readonly zeigen
            unfall_konstellation: lead.unfall_konstellation ?? null,
            gegner_anzahl_beteiligte: lead.gegner_anzahl_beteiligte ?? null,
            gegner_fahrzeugtyp: lead.gegner_fahrzeugtyp ?? null,
            // CMM-14: steuert die LexDrive-Visitenkarte am Ende
            service_typ: lead.service_typ ?? null,
            // AAR-956 §3a: Self-Service-Quali-State (steuert den incomplete-Pfad)
            schuldfrage: lead.schuldfrage ?? null,
            disqualifiziert: lead.disqualifiziert ?? null,
            // P4 UX: Vermittlungs-Erkennung fuer den Client-Kontext-Rebuild nach Quali
            source_channel: lead.source_channel ?? null,
          }}
          legalDocs={getAllLegalDocs()}
          beratungstermin={beratungstermin}
        />
      </NextIntlClientProvider>
    </div>
  )
}
