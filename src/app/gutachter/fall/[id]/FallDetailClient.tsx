'use client'

// AAR-289: Schlanke Shell für die SV-Fallakte mit Phasen-Stepper, Akte-Drawer
// und 2-Spalten-Layout (Desktop) bzw. stacked (Mobile).
//
// - Linke Spalte (sticky auf Desktop, schmal): AktuellePhaseCard mit phasen-
//   spezifischem Hint + CTA. AAR-291/293/294 erweitern dies um Tasks/Aktionen.
// - Rechte Spalte (scrollbar, breit): Stammdaten, Dokumente-Übersicht,
//   Timeline-Vorschau (kompakte Karten).
// - Unter dem Layout: FallakteVollClient mit den bestehenden 7 Tabs als
//   „Detail-Block" — wird durch Children 2/3/4 schrittweise abgelöst.
// - Akte-Button im Header öffnet einen Full-Screen-Drawer (Dateien/Timeline/Chat).

import { getSvSubphase, type AbrechnungSubphaseInput } from '@/lib/gutachter/subphase'
import { getSichtbarFuerRolle } from '@/lib/dokumente/sichtbarkeit'
// AAR-745 (Phase A): Visibility-Single-Source — gleiche Regel wie Admin-ProzessTab,
// gefiltert auf die SV-Sektionen. Cards self-gaten intern weiter (Defense-in-Depth).
// AAR-568 (V2) / AAR-727: Pipeline-Daten baut FallPhasenPanel intern — der
// FallHeader reicht nur fallId + abgeschlossen_am durch.
// CMM-44 MP-6a: aktuelle_phase-Passthrough entfernt — FallHeader hat die
// Phasen-Leiste nie gerendert (FallIdentityHeader), Prop war tot.
import { FallHeader } from './_components/FallHeader'
// CMM-23: FallMitteilungenBanner aus der SV-View entfernt — Aaron-Spec
// "der SV braucht erstmal die Mitteilungen nicht". Mitteilungen wie
// "Kunde hat SA unterschrieben" sind für SV irrelevant; was er wissen
// muss steht im AuftragDokumenteBanner + Stepper. Falls später eine
// gefilterte SV-Mitteilungs-Sicht gebraucht wird, kommt sie zurück.
import type { TeamMitglied } from './_components/FallakteDrawer'
// CMM-23: AktuellePhaseCard, KanzleiRegulierungsStepperCard,
// KanzleiStatusCard, AbrechnungsCard, AbrechnungsartCard, ReklamationsCard,
// SvHonorarCard wurden aus der SV-FallDetail-View entfernt — sind KB/Admin-
// Tools oder werden durch den AuftragsphaseStepper + MeinFallStatusCard
// (page.tsx) ersetzt. Eine Karte = eine Funktion (Aaron-Spec).
// CMM-23 Aaron-Layout-Spec: Sidebar links = Stepper + Stammdaten;
// Section rechts = Termin + Gutachten + hochgeladene Dokumente. Keine
// Briefing-Sidebar, keine JetztZuTunCard, keine Timeline-Vorschau,
// keine SvTools-Sammelkarte (ZB1/Gutachten/Datei-Upload sind anderswo platziert) —
// nur die schlanke FinNachtragenCard erscheint, falls gar keine FIN hinterlegt ist (S1),
// kein Activity-Feed. Stellungnahme/Nachbesichtigung/Konfrontation
// rendern als Mitteilungs-Banner oben (topServerBlocks aus page.tsx).
// CMM-32: Master-Detail-Stammdaten — Accordion mit Inline-Expansion.
// C4b (Fundament „Eine Akte"): SV rendert jetzt ueber den <FallAkte layout='stack'>-Kern.
import { FallAkte } from '@/components/fall-akte/FallAkte'
import type { FallAkteConfig } from '@/components/fall-akte/types'
import { SvContentZone, type SvContentVm } from './_components/SvContentZone'
import AuftragHeaderPanel from '@/components/gutachter/AuftragHeaderPanel'
// AAR-559 (C10): SV-Konfrontations-Antwort-Card — re-wire nach CMM-66-Regression.
import { KonfrontationsTerminCard } from '@/components/gutachter/KonfrontationsTerminCard'
import FallWindowDropzone from '@/components/gutachter/FallWindowDropzone'
import { type PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'
import type { SvLifecyclePhase } from '@/lib/auftrag/phase'
// CMM-23: FallActivityFeed + FallDokumenteSidebar raus (Activity-Feed
// ohne Tagesgeschäfts-Use-Case; Dokumente-Sidebar war phase-/szenario-
// gebunden und zeigte oft "Phase nicht gesetzt"). Ersetzt durch die
// schlanke WeitereDokumenteCard rechts.
import type { FallDokumentRow } from '@/components/faelle/FallDokumenteSidebar'
// CMM-36: Geo-Tracking
import { useGeoTracking } from '@/hooks/useGeoTracking'
import { SvUnterwegsInfo } from '@/components/gutachter/SvUnterwegsInfo'

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type Kundenbetreuer = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type TerminInfo = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
  geschaetzte_fahrtzeit_min?: number | null
  sv_angekommen_am?: string | null
  sv_unterwegs_seit?: string | null
  sv_eta_minuten?: number | null
}

type Pflichtdoc = {
  id: string
  dokument_typ: string
  status: string | null
  pflicht: boolean | null
}

type TimelineEvent = {
  id: string
  typ: string | null
  titel: string | null
  beschreibung: string | null
  created_at: string | null
}

type Props = {
  fall: Record<string, unknown>
  lead: Lead
  dokumente: Record<string, unknown>[]
  pflichtdokumente: Pflichtdoc[]
  parteien: Record<string, unknown>[]
  timeline: TimelineEvent[]
  nachrichten: Record<string, unknown>[]
  kundenbetreuer?: Kundenbetreuer
  /** AAR-405 Phase 5: Kanzlei-Ansprechpartner (sobald der Fall an eine Kanzlei
      uebergeben ist). Firma + Kontakt aus `kanzleien` via `kanzlei_faelle`. */
  kanzlei?: { name: string | null; email: string | null; ansprechpartner: string | null } | null
  /** currentUserId fuer den eingebetteten Fall-Chat (ClaimChatPanel). */
  currentUserId?: string | null
  aktiverTermin?: TerminInfo | null
  fallDokumente?: FallDokumentRow[]
  /** AAR-289: Abrechnungs-Snippet für Subphase-Ableitung (ausgezahlt_am). */
  abrechnungAusgezahltAm?: string | null
  /** AAR-403: Kürzungs-Positionen — CMM-23: nicht mehr in der SV-View
      gerendert; bleibt in den Props für Aufwärtskompatibilität, wird ignoriert. */
  kuerzungen?: Array<{ id: string; typ: string | null; bezeichnung: string | null; betrag_gefordert: number | null; betrag_reguliert: number | null; betrag_gekuerzt: number | null }>
  /** AAR-559 (C10): Konfrontations-Wunsch des Kunden (C9) */
  konfrontationGewuenscht?: boolean
  konfrontationTerminVereinbartAm?: string | null
  konfrontationTerminVorschlaege?: Array<{ datum: string; uhrzeit: string }> | null
  /** CMM-23: Server-rendered Top-Blocks (gelber Banner, Briefing, Stellungnahme/
      Nachbesichtigung/Konfrontation als Mitteilung wenn aktiv, MeinFallStatusCard).
      Wird direkt nach dem FallHeader vor dem 2-Spalten-Layout gerendert. */
  topServerBlocks?: React.ReactNode
  /** CMM-32: Vor-Ort-Trigger („Bin angekommen" + Navigieren) wandert ans
      Ende der Seite — Aaron-Spec, damit der Banner oben aufgeräumt bleibt. */
  vorOrtCard?: React.ReactNode
  /** CMM-33: Pflicht-Slots für die zentrale Dokumente-Sektion unten rechts. */
  pflichtSlots?: PflichtSlotForView[]
  /** CMM-23: Auftrags-Phase für den Stepper in der linken Sidebar. */
  svPhase?: SvLifecyclePhase
  gutachtenInQc?: boolean
  /** CMM-36: Geo-Tracking — ID + Vorname des SVs für ETA-Anzeige */
  svId?: string | null
  svVorname?: string | null
  /** AAR (14.05.2026): OCR-extrahierte Gutachten-Werte für SV-Verifikation. */
  gutachtenWerte?: {
    gutachten_datum: string | null
    reparaturkosten_netto: number | null
    reparaturkosten_brutto: number | null
    minderwert: number | null
    wiederbeschaffungswert: number | null
    restwert: number | null
    nutzungsausfall_tage: number | null
    gutachten_sv_honorar_brutto: number | null
    gutachten_nutzungsausfall_tagessatz_eur: number | null
    wiederbeschaffungsdauer_tage: number | null
    totalschaden: boolean | null
    gutachten_ocr_manuell_ueberschrieben: boolean | null
  } | null
}

export default function FallDetailClient(props: Props) {
  const {
    fall,
    lead,
    dokumente,
    pflichtdokumente,
    timeline,
    nachrichten,
    kundenbetreuer,
    kanzlei,
    currentUserId,
    abrechnungAusgezahltAm,
  } = props

  const abrechnung: AbrechnungSubphaseInput = abrechnungAusgezahltAm
    ? { ausgezahlt_am: abrechnungAusgezahltAm }
    : null

  const subphase = getSvSubphase(
    {
      // CMM-49 T1.2: SV-Stepper aus abgeleiteter Phase (v_claim_phase) statt faelle.status.
      main_phase: (fall.main_phase as string | null) ?? null,
      sub_phase: (fall.sub_phase as string | null) ?? null,
      gutachter_termin_bestaetigt: (fall.gutachter_termin_bestaetigt as boolean | null) ?? null,
      sv_termin: (fall.sv_termin as string | null) ?? null,
      gutachten_eingegangen_am: (fall.gutachten_eingegangen_am as string | null) ?? null,
      zahlung_eingegangen_am: (fall.zahlung_eingegangen_am as string | null) ?? null,
    },
    abrechnung,
  )

  // AAR-568 (V2) / AAR-727 / CMM-44 MP-5: Panel-Input — buildClaimPhasePipeline (4-Phasen-Lifecycle) läuft intern.
  // CMM-44 MP-6a: aktuellePhaseSnake entfernt — FallHeader rendert keine
  // Phasen-Leiste (FallIdentityHeader), der Wert war ungenutzt.
  const abgeschlossenAm =
    (fall.abgeschlossen_am as string | null | undefined) ?? null

  // AAR-289: Sichtbarkeits-Filter (zweite Ebene zusätzlich zu DB-sichtbar_fuer)
  const sichtbarDokumente = getSichtbarFuerRolle(dokumente, 'sachverstaendiger')
  const sichtbarFallDokumente = props.fallDokumente
    ? getSichtbarFuerRolle(props.fallDokumente, 'sachverstaendiger')
    : undefined

  const fallNummer = (fall.claim_nummer as string | null) ?? (fall.id as string).slice(0, 8)
  const kundenName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
  const ort = (fall.schadens_ort as string | null) ?? ''
  // CMM-32 Walkthrough: SV-Header ergänzt um Kennzeichen + Marke/Modell.
  const kennzeichen = (fall.kennzeichen as string | null) ?? null
  const fahrzeug =
    [(fall.fahrzeug_hersteller as string | null), (fall.fahrzeug_modell as string | null)]
      .filter(Boolean)
      .join(' ') || null

  // AAR-405: Team-Tab befüllen — Kundenbetreuer, Kanzlei (sobald uebergeben) + Kunde.
  const team: TeamMitglied[] = []
  if (kundenbetreuer) {
    const kbName =
      `${kundenbetreuer.vorname ?? ''} ${kundenbetreuer.nachname ?? ''}`.trim() ||
      'Kundenbetreuer'
    team.push({
      rolle: 'kundenbetreuer',
      name: kbName,
      email: kundenbetreuer.email,
      telefon: kundenbetreuer.telefon,
    })
  }
  if (kanzlei && (kanzlei.name || kanzlei.ansprechpartner || kanzlei.email)) {
    team.push({
      rolle: 'kanzlei',
      name: kanzlei.name?.trim() || kanzlei.ansprechpartner?.trim() || 'Kanzlei',
      email: kanzlei.email,
      telefon: null,
    })
  }
  if (lead && (lead.vorname || lead.nachname || lead.email || lead.telefon)) {
    const leadName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Kunde'
    team.push({
      rolle: 'kunde',
      name: leadName,
      email: lead.email,
      telefon: lead.telefon,
    })
  }

  const drawerData = {
    fallNummer,
    team,
    dokumente: [
      ...sichtbarDokumente.map((d) => ({
        id: (d.id as string) ?? undefined,
        typ: (d.typ as string | null) ?? null,
        kategorie: (d.kategorie as string | null) ?? null,
        datei_url: (d.datei_url as string | null) ?? null,
        datei_name: (d.datei_name as string | null) ?? null,
        created_at: (d.created_at as string | null) ?? null,
      })),
      ...((sichtbarFallDokumente ?? []).map((d) => ({
        id: d.id,
        dokument_typ: d.dokument_typ,
        storage_path: d.storage_path,
        original_filename: d.original_filename,
        hochgeladen_am: d.hochgeladen_am,
      }))),
    ],
    timeline,
    nachrichten: nachrichten.map((n) => ({
      id: n.id as string | undefined,
      inhalt: (n.nachricht as string) ?? (n.inhalt as string) ?? null,
      absender_name: (n.sender_rolle as string | null) ?? null,
      absender_rolle: (n.sender_rolle as string | null) ?? null,
      created_at: (n.created_at as string | null) ?? null,
    })),
  }

  // CMM-32 Walkthrough: Termin-Actions sind in AuftragHeaderPanel integriert,
  // zeigeTerminActions wird dort intern berechnet.
  const aktiverTermin = props.aktiverTermin ?? null
  const hatGutachten = !!fall.gutachten_eingegangen_am

  // CMM-32 Walkthrough: Klare Trennung der drei Ortsangaben:
  //   - besichtigungsort = wo der SV hinfährt (Termin-Banner + Geo-Tracking)
  //   - unfallort/schadens_ort = wo der Unfall passiert ist (Stammdaten)
  //   - lead.adresse = Wohnadresse des Kunden (Stammdaten / Lead)
  // Banner + Tracking ziehen ausschließlich besichtigungsort.
  const besichtigungsAdresse = (fall.besichtigungsort_adresse as string | null) ?? null
  const unfallAdresse =
    (fall.unfallort as string | null) ??
    ([(fall.schadens_adresse as string | null), (fall.schadens_plz as string | null), (fall.schadens_ort as string | null)]
      .filter(Boolean)
      .join(', ') || null)
  void unfallAdresse // wird unten in der rechten Spalte / Stammdaten konsumiert

  const geoTracking = useGeoTracking({
    svId: props.svId ?? null,
    zielAdresse: hatGutachten ? null : besichtigungsAdresse,
    terminStartIso: aktiverTermin?.start_zeit ?? null,
    terminStatus: aktiverTermin?.status ?? null,
    geschaetzteFahrtzeitMin: aktiverTermin?.geschaetzte_fahrtzeit_min ?? null,
    kundeAngekommenAm: aktiverTermin?.sv_angekommen_am ?? null,
    terminId: aktiverTermin?.id ?? null,
    zielLat: (fall.besichtigungsort_lat as number | null) ?? null,
    zielLng: (fall.besichtigungsort_lng as number | null) ?? null,
    initialEtaMinuten: aktiverTermin?.sv_eta_minuten ?? null,
  })

  // C4b: die Content-Zone (grid + Gutachten/Werte/Copilot/Chat) rendert als stabile SvContentZone.
  const svContentVm: SvContentVm = {
    fall,
    lead,
    parteien: props.parteien,
    dokumente,
    team,
    sichtbarFallDokumente,
    fallNummer,
    subphase,
    gutachtenWerte: props.gutachtenWerte ?? null,
    currentUserId: currentUserId ?? null,
  }

  // C4b: die SV-Shell kommt aus dem <FallAkte layout='stack'>-Kern. Full-Bleed-Wrapper + Realtime +
  // sticky FallHeader (header.custom) + Stepper/Geo/topServerBlocks/Konfrontation (slots.topBlocks,
  // inline — nutzt useGeoTracking) + Content-Zone + vorOrtCard (slots.footer). Behavior-preserving.
  const config: FallAkteConfig<SvContentVm, 'content'> = {
    layout: 'stack',
    wrapperClassName:
      'min-h-full bg-claimondo-bg -mx-2 sm:-mx-3 lg:-mx-4 -mb-2 sm:-mb-3 lg:-mb-4 -mt-2 sm:-mt-3 lg:-mt-4 [&_.rounded-2xl]:shadow-sm',
    realtime: () => ({ fallId: fall.id as string, claimId: (fall.claim_id as string | null) ?? null }),
    header: () => ({
      custom: (
        // AAR-864: Akten-Header sticky direkt am Wrapper-Oberrand.
        <div className="sticky -top-2 sm:-top-3 lg:-top-4 z-30 bg-claimondo-bg shadow-sm">
          <FallHeader
            fallNummer={fallNummer}
            fallId={fall.id as string}
            kundenName={kundenName}
            ort={ort}
            kennzeichen={kennzeichen}
            fahrzeug={fahrzeug}
            subphase={subphase}
            drawer={drawerData}
            abgeschlossenAm={abgeschlossenAm}
          />
        </div>
      ),
    }),
    zones: () => ['content'] as ('content')[],
    zoneComponents: { content: SvContentZone },
    slots: () => ({
      beforeHeader: <FallWindowDropzone fallId={fall.id as string} />,
      topBlocks: (
        <>
          {/* Stepper + Termin-Banner als verschmolzener Header — volle Breite */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-3">
            <SvUnterwegsInfo tracking={geoTracking} svVorname={props.svVorname ?? null} />
            {props.svPhase &&
              !['gutachten-freigegeben', 'bei-kanzlei', 'stellungnahme', 'nachbesichtigung', 'auszahlung', 'abgeschlossen-fall'].includes(props.svPhase) && (
                <AuftragHeaderPanel
                  phase={props.svPhase}
                  gutachtenInQc={props.gutachtenInQc}
                  termin={aktiverTermin}
                  adresse={besichtigungsAdresse}
                  fallId={fall.id as string}
                  briefingText={(fall.sv_briefing_text as string | null) ?? null}
                  pflichtSlots={props.pflichtSlots ?? []}
                />
              )}
          </div>
          {/* CMM-23: Server-rendered Top-Blocks (Briefing/Einzuholen/Stellungnahme/MeinFallStatusCard) */}
          {props.topServerBlocks && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 space-y-3">
              {props.topServerBlocks}
            </div>
          )}
          {/* AAR-559 (C10): SV-Konfrontations-Antwort (Annehmen/Ablehnen). */}
          {props.konfrontationGewuenscht && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
              <KonfrontationsTerminCard
                fallId={fall.id as string}
                konfrontationGewuenscht={props.konfrontationGewuenscht}
                terminVereinbartAm={props.konfrontationTerminVereinbartAm ?? null}
                terminVorschlaege={props.konfrontationTerminVorschlaege ?? null}
              />
            </div>
          )}
        </>
      ),
      // CMM-32: Vor-Ort-Trigger ganz unten.
      footer: props.vorOrtCard ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">{props.vorOrtCard}</div>
      ) : null,
    }),
  }

  return <FallAkte config={config} vm={svContentVm} />
}
