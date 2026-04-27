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
import { getVisibleFallSections } from '@/lib/fall/section-visibility'
// AAR-568 (V2) / AAR-727: Pipeline-Daten baut FallPhasenPanel intern — der
// FallHeader reicht nur fallId + aktuelle_phase + abgeschlossen_am durch.
import { FallHeader } from './_components/FallHeader'
// AAR-770: Mitteilungs-Banner ganz oben in der Fallakte (shared)
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import type { TeamMitglied } from './_components/FallakteDrawer'
// CMM-23: AktuellePhaseCard, KanzleiRegulierungsStepperCard,
// KanzleiStatusCard, AbrechnungsCard, AbrechnungsartCard, ReklamationsCard,
// SvHonorarCard wurden aus der SV-FallDetail-View entfernt — sind KB/Admin-
// Tools oder werden durch den AuftragsphaseStepper + MeinFallStatusCard
// (page.tsx) ersetzt. Eine Karte = eine Funktion (Aaron-Spec).
import { JetztZuTunCard } from './_components/JetztZuTunCard'
import { StammdatenCard } from './_components/StammdatenCard'
import { TerminCard } from './_components/TerminCard'
import { GutachtenCard } from './_components/GutachtenCard'
import { DokumenteUebersichtCard } from './_components/DokumenteUebersichtCard'
import { TimelineVorschauCard } from './_components/TimelineVorschauCard'
import { StellungnahmeCard } from './_components/StellungnahmeCard'
import { NachbesichtigungCard } from './_components/NachbesichtigungCard'
import { KonfrontationsTerminCard } from '@/components/gutachter/KonfrontationsTerminCard'
// AAR-757: FallakteVollClient aufgelöst, unique Features extrahiert
import { TerminActionsPanel } from './_components/TerminActionsPanel'
import { SvToolsCard } from './_components/SvToolsCard'
import { VorOrtTriggerCard } from './_components/VorOrtTriggerCard'
import FallActivityFeed, { buildActivityEvents } from '@/components/faelle/FallActivityFeed'
import FallDokumenteSidebar, { type FallDokumentRow } from '@/components/faelle/FallDokumenteSidebar'
// AAR-377: Shared BriefingCard — in der SV-Fallakte read-only (kein Regenerate).
import BriefingCard from '@/components/fall/BriefingCard'
import type { GutachterTask } from '@/hooks/useGutachterTasks'
import type { SvAbrechnungInput } from '@/lib/gutachter/abrechnung'
// AAR-327: Dokument-Anforderungs-UI (Modal + Liste, wiederverwendbar)
import AnforderungenListe, {
  type AnforderungsItem,
} from '@/components/dokumente/AnforderungenListe'
import type { AnforderbarerSlot } from '@/components/dokumente/AnforderungsModal'

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
  chatTeilnehmer?: {
    user_id: string
    rolle: string
    vorname: string | null
    nachname: string | null
    avatar_url: string | null
  }[]
  aktiverTermin?: TerminInfo | null
  fallDokumente?: FallDokumentRow[]
  /** AAR-289: Abrechnungs-Snippet für Subphase-Ableitung (ausgezahlt_am). */
  abrechnungAusgezahltAm?: string | null
  /** AAR-291: Tasks initial geladen (SSR), Hook refresht via Realtime. */
  tasks?: GutachterTask[]
  /** AAR-293: SV-Abrechnung (Honorar/Lead/Netto) für Phase 6.x Card */
  abrechnung?: SvAbrechnungInput | null
  /** AAR-327: Katalog-Slots die der SV anfordern darf (serverseitig gefiltert) */
  anforderbareSlots?: AnforderbarerSlot[]
  /** AAR-327: Anforderungen die der eingeloggte SV bereits gestellt hat */
  anforderungenVonMir?: AnforderungsItem[]
  /** AAR-403: Kürzungs-Positionen — CMM-23: nicht mehr in der SV-View
      gerendert; bleibt in den Props für Aufwärtskompatibilität, wird ignoriert. */
  kuerzungen?: Array<{ id: string; typ: string | null; bezeichnung: string | null; betrag_gefordert: number | null; betrag_reguliert: number | null; betrag_gekuerzt: number | null }>
  /** AAR-399: Katalog-Slots für SV-Upload (merged mit pflichtdokumente-Status) */
  svSlots?: SvSlotRow[]
  /** AAR-559 (C10): SV-Honorar (nur SV-Anteil, nie Brutto) */
  svHonorarBetrag?: number | null
  svHonorarEingegangenAm?: string | null
  /** AAR-559 (C10): Konfrontations-Wunsch des Kunden (C9) */
  konfrontationGewuenscht?: boolean
  konfrontationTerminVereinbartAm?: string | null
  konfrontationTerminVorschlaege?: Array<{ datum: string; uhrzeit: string }> | null
}

/** AAR-399: Lokaler Typ, passt zu DokumentenListe.SlotRow */
export type SvSlotRow = {
  id: string | null
  slotId: string
  label: string
  beschreibung: string | null
  istPflicht: boolean
  status:
    | 'ausstehend'
    | 'hochgeladen'
    | 'geprueft'
    | 'abgelehnt'
    | 'nachgereicht_angefordert'
    | 'optional'
  currentFile: { name: string; url?: string | null; size?: number | null } | null
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
    abrechnungAusgezahltAm,
  } = props

  const abrechnung: AbrechnungSubphaseInput = abrechnungAusgezahltAm
    ? { ausgezahlt_am: abrechnungAusgezahltAm }
    : null

  const subphase = getSvSubphase(
    {
      status: (fall.status as string | null) ?? null,
      gutachter_termin_bestaetigt: (fall.gutachter_termin_bestaetigt as boolean | null) ?? null,
      sv_termin: (fall.sv_termin as string | null) ?? null,
      gutachten_eingegangen_am: (fall.gutachten_eingegangen_am as string | null) ?? null,
      zahlung_eingegangen_am: (fall.zahlung_eingegangen_am as string | null) ?? null,
    },
    abrechnung,
  )

  // AAR-745: Portal-Sichtbarkeit (SV) × Phase/Trigger-Regeln. Szenario
  // bleibt null, weil SvSubphase keine Szenario-Ableitung hat — das ist
  // admin-zentriert und für SV irrelevant (Klage-Section ist ohnehin
  // nicht in der SV-Whitelist).
  const visibleSections = getVisibleFallSections(fall, 'sv', {
    phase: subphase.phase,
    szenario: null,
  })

  // AAR-568 (V2) / AAR-727: Panel-Input — buildPhasePipelineData läuft intern
  // im FallPhasenPanel, Caller gibt nur die Rohdaten weiter.
  const aktuellePhaseSnake =
    (fall.aktuelle_phase as string | null | undefined) ?? null
  const abgeschlossenAm =
    (fall.abgeschlossen_am as string | null | undefined) ?? null

  // AAR-289: Sichtbarkeits-Filter (zweite Ebene zusätzlich zu DB-sichtbar_fuer)
  const sichtbarDokumente = getSichtbarFuerRolle(dokumente, 'sachverstaendiger')
  const sichtbarFallDokumente = props.fallDokumente
    ? getSichtbarFuerRolle(props.fallDokumente, 'sachverstaendiger')
    : undefined

  const fallNummer = (fall.fall_nummer as string | null) ?? (fall.id as string).slice(0, 8)
  const kundenName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
  const ort = (fall.schadens_ort as string | null) ?? ''

  // AAR-405: Team-Tab befüllen — Kundenbetreuer + Kunde; Kanzlei folgt mit
  // eigener Daten-Ladung, sobald Phase 5 (Kanzlei-Integration) live ist.
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

  // AAR-757: Termin-Actions + Vor-Ort + ActivityFeed-Eingaben
  const aktiverTermin = props.aktiverTermin ?? null
  const zeigeTerminActions =
    aktiverTermin?.status === 'reserviert' || aktiverTermin?.status === 'gegenvorschlag'
  const hatGutachten = !!fall.gutachten_eingegangen_am
  const zeigeVorOrt =
    !!fall.sv_termin &&
    !hatGutachten &&
    (fall.status === 'sv-termin' || fall.status === 'sv-zugewiesen')
  const schadensAdresse =
    [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]
      .filter(Boolean)
      .join(', ') || null

  return (
    <div className="min-h-full bg-[#f8f9fb]">
      <FallHeader
        fallNummer={fallNummer}
        fallId={fall.id as string}
        kundenName={kundenName}
        ort={ort}
        subphase={subphase}
        drawer={drawerData}
        aktuellePhaseSnake={aktuellePhaseSnake}
        abgeschlossenAm={abgeschlossenAm}
      />

      {/* AAR-770: Mitteilungs-Banner — direkt unter dem Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <FallMitteilungenBanner fallId={fall.id as string} rolle="sachverstaendiger" />
      </div>

      {/* AAR-757: Phase-gated Banner unter dem Header (vorher in VollClient) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-3">
        {zeigeTerminActions && aktiverTermin && (
          <TerminActionsPanel fallId={fall.id as string} termin={aktiverTermin} />
        )}
        {zeigeVorOrt && (
          <VorOrtTriggerCard
            fallId={fall.id as string}
            kundeName={kundenName}
            kennzeichen={(fall.kennzeichen as string | null) ?? null}
            adresse={schadensAdresse}
          />
        )}
      </div>

      {/* 2-Spalten-Layout: Desktop ≥1024px sticky-links, Mobile stacked */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_1fr] gap-4 sm:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start min-w-0">
          {/* AAR-377 / AAR-772: SV-Briefing oben in der Sidebar — Plain-Text,
              read-only für SV. Struktur-Briefing zeigen wir dem SV NICHT
              (das ist Onboarding-Material für uns intern). Wird auto-
              generiert beim Öffnen der Page (siehe page.tsx). */}
          <BriefingCard
            fallId={fall.id as string}
            briefing={(fall.sv_briefing_text as string | null) ?? null}
            generatedAt={(fall.sv_briefing_generated_at as string | null) ?? null}
            model={(fall.sv_briefing_model as string | null) ?? null}
            version={(fall.sv_briefing_version as number | null) ?? null}
            canRegenerate={false}
          />
          <JetztZuTunCard
            fallId={fall.id as string}
            initialTasks={props.tasks ?? []}
            subphase={subphase}
            aktiverTermin={
              props.aktiverTermin
                ? {
                    id: props.aktiverTermin.id,
                    status: props.aktiverTermin.status,
                    start_zeit: props.aktiverTermin.start_zeit ?? null,
                    vorgeschlagenes_datum:
                      props.aktiverTermin.vorgeschlagenes_datum ?? null,
                    gegenvorschlag_von:
                      (props.aktiverTermin.gegenvorschlag_von as
                        | 'sv'
                        | 'kunde'
                        | null) ?? null,
                  }
                : null
            }
            fall={{
              status: (fall.status as string | null) ?? null,
              technische_stellungnahme_status:
                (fall.technische_stellungnahme_status as string | null) ?? null,
              gutachten_final_freigegeben:
                (fall.gutachten_final_freigegeben as boolean | null) ?? null,
              gutachten_eingegangen_am:
                (fall.gutachten_eingegangen_am as string | null) ?? null,
              zahlung_eingegangen_am:
                (fall.zahlung_eingegangen_am as string | null) ?? null,
            }}
          />
          {/* CMM-23: ReklamationsCard entfernt (KB-Tool — SV nicht relevant).
              Stellungnahme + Nachbesichtigung bleiben als Edge-Cases. */}
          {visibleSections.includes('stellungnahme') && (
            <StellungnahmeCard
              fall={{
                id: fall.id as string,
                technische_stellungnahme_status:
                  (fall.technische_stellungnahme_status as string | null) ?? null,
                technische_stellungnahme_beauftragt_am:
                  (fall.technische_stellungnahme_beauftragt_am as string | null) ?? null,
                technische_stellungnahme_hochgeladen_am:
                  (fall.technische_stellungnahme_hochgeladen_am as string | null) ?? null,
                technische_stellungnahme_freigabe_am:
                  (fall.technische_stellungnahme_freigabe_am as string | null) ?? null,
              }}
              id="stellungnahme-card"
            />
          )}
          {visibleSections.includes('nachbesichtigung') && (
            <NachbesichtigungCard
              fall={{
                id: fall.id as string,
                nachbesichtigung_status:
                  (fall.nachbesichtigung_status as string | null) ?? null,
                nachbesichtigung_angefordert_am:
                  (fall.nachbesichtigung_angefordert_am as string | null) ?? null,
                nachbesichtigung_termin_datum:
                  (fall.nachbesichtigung_termin_datum as string | null) ?? null,
                nachbesichtigung_ergebnis:
                  (fall.nachbesichtigung_ergebnis as string | null) ?? null,
              }}
              id="nachbesichtigung-card"
            />
          )}
          {/* AAR-559 (C10): Konfrontations-Termin-Annahme/Ablehnung, wenn
              der Kunde im Kunde-Portal (C9) SV-Präsenz gewünscht hat. */}
          <KonfrontationsTerminCard
            fallId={fall.id as string}
            konfrontationGewuenscht={props.konfrontationGewuenscht ?? false}
            terminVereinbartAm={props.konfrontationTerminVereinbartAm ?? null}
            terminVorschlaege={props.konfrontationTerminVorschlaege ?? null}
          />
          {/* CMM-23: Folgende Cards aus der SV-FallDetail-View entfernt —
              sie waren KB/Admin-Tools oder werden durch Stepper/MeinFallStatusCard
              (siehe page.tsx) ersetzt:
              - AktuellePhaseCard       → AuftragsphaseStepper im Header
              - AbrechnungsartCard      → KB-Tool
              - KanzleiRegulierungsStepperCard → KB-Tool
              - KanzleiStatusCard       → ersetzt durch MeinFallStatusCard
                                          (zeigt LexDrive-Deep-Link statt
                                          Regulierungs-Details)
              - AbrechnungsCard         → KB-Tool */}
          {/* CMM-23: SvHonorarCard hier entfernt — Auszahlungs-Status zeigt
              die MeinFallStatusCard in der page.tsx (Phase 'auszahlung'). */}
        </aside>

        <section className="space-y-4 min-w-0">
          <StammdatenCard lead={lead} fall={fall} kundenbetreuer={kundenbetreuer ?? null} />
          {/* AAR-397: Read-only Termin-Card zwischen Stammdaten und Dokumenten. */}
          <TerminCard
            termin={
              props.aktiverTermin
                ? {
                    id: props.aktiverTermin.id,
                    status: props.aktiverTermin.status,
                    start_zeit: props.aktiverTermin.start_zeit ?? null,
                    end_zeit: props.aktiverTermin.end_zeit ?? null,
                    vorgeschlagenes_datum:
                      props.aktiverTermin.vorgeschlagenes_datum ?? null,
                    gegenvorschlag_von:
                      props.aktiverTermin.gegenvorschlag_von ?? null,
                    gegenvorschlag_grund:
                      props.aktiverTermin.gegenvorschlag_grund ?? null,
                  }
                : null
            }
            fall={{
              id: fall.id as string,
              schadens_adresse: (fall.schadens_adresse as string | null) ?? null,
              schadens_plz: (fall.schadens_plz as string | null) ?? null,
              schadens_ort: (fall.schadens_ort as string | null) ?? null,
            }}
          />
          {/* AAR-404: Gutachten prominent zwischen Termin und Dokumenten-Übersicht. */}
          <GutachtenCard
            fallId={fall.id as string}
            fallNummer={fallNummer}
            subphase={subphase}
            gutachten={
              (sichtbarFallDokumente ?? [])
                .filter((d) => d.dokument_typ === 'gutachten')
                .map((d) => ({
                  id: d.id,
                  dokument_typ: d.dokument_typ,
                  storage_path: d.storage_path,
                  original_filename: d.original_filename,
                  hochgeladen_am: d.hochgeladen_am,
                }))
            }
          />
          <DokumenteUebersichtCard
            fallId={fall.id as string}
            svSlots={props.svSlots ?? []}
            totalDokumente={sichtbarDokumente.length + (sichtbarFallDokumente?.length ?? 0)}
          />
          {/* AAR-327: SV kann gezielt Dokumente beim Kunden anfordern
              (z. B. Reparaturrechnungen-Vorschäden, zusätzliche Schadensfotos) */}
          {props.anforderbareSlots && props.anforderbareSlots.length > 0 && (
            <AnforderungenListe
              fallId={fall.id as string}
              rolleLabel="Gutachter"
              slotsVerfuegbar={props.anforderbareSlots}
              anforderungen={props.anforderungenVonMir ?? []}
            />
          )}
          <TimelineVorschauCard events={timeline} />

          {/* AAR-757: SV-Tools-Card (FIN + ZB1 + Gutachten + Datei-Upload)
              bündelt die Flows die früher über die VollClient-Tabs verstreut waren. */}
          <SvToolsCard
            fallId={fall.id as string}
            fallFin={(fall.fin_vin as string | null) ?? null}
            finQuelle={(fall.fin_quelle as string | null) ?? null}
            vorschadenGeprueft={!!fall.vorschaden_geprueft}
            hatVorschaeden={!!fall.hat_vorschaeden}
            vorschadenAnzahl={(fall.vorschaden_anzahl as number | null) ?? null}
            hasGutachten={hatGutachten}
          />

          {/* AAR-757: Activity-Feed + Dokumente-Sidebar als Reihen-Paar unten */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <FallActivityFeed
              fallId={fall.id as string}
              events={buildActivityEvents(
                timeline as { id: string; typ: string; titel: string; beschreibung?: string | null; erstellt_von?: string | null; lead_id?: string | null; created_at: string }[],
                [],
                nachrichten as { id: string; kanal: string; sender_rolle?: string | null; nachricht: string; lead_id?: string | null; created_at: string }[],
              )}
              maxItems={8}
            />
            <FallDokumenteSidebar
              fallId={fall.id as string}
              aktuellePhase={fall.aktuelle_phase as string | null}
              szenario={fall.szenario as string | null}
              dokumente={props.fallDokumente ?? []}
            />
          </div>
        </section>
      </div>

    </div>
  )
}
