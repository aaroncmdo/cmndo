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
// keine SvTools (FIN/ZB1 hat der SV in seiner Gutachten-Software),
// kein Activity-Feed. Stellungnahme/Nachbesichtigung/Konfrontation
// rendern als Mitteilungs-Banner oben (topServerBlocks aus page.tsx).
import { StammdatenCard } from './_components/StammdatenCard'
import { TerminCard } from './_components/TerminCard'
import { GutachtenCard } from './_components/GutachtenCard'
import AuftragsphaseStepper from '@/components/gutachter/AuftragsphaseStepper'
import WeitereDokumenteCard from '@/components/gutachter/WeitereDokumenteCard'
import type { SvLifecyclePhase } from '@/lib/auftrag/phase'
// AAR-757: FallakteVollClient aufgelöst, unique Features extrahiert
import { TerminActionsPanel } from './_components/TerminActionsPanel'
import { SvToolsCard } from './_components/SvToolsCard'
import { VorOrtTriggerCard } from './_components/VorOrtTriggerCard'
// CMM-23: FallActivityFeed + FallDokumenteSidebar raus (Activity-Feed
// ohne Tagesgeschäfts-Use-Case; Dokumente-Sidebar war phase-/szenario-
// gebunden und zeigte oft "Phase nicht gesetzt"). Ersetzt durch die
// schlanke WeitereDokumenteCard rechts.
import type { FallDokumentRow } from '@/components/faelle/FallDokumenteSidebar'
// CMM-23: BriefingCard wandert nach page.tsx (topServerBlocks).
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
  /** CMM-23: Server-rendered Top-Blocks (gelber Banner, Briefing, Stellungnahme/
      Nachbesichtigung/Konfrontation als Mitteilung wenn aktiv, MeinFallStatusCard).
      Wird direkt nach dem FallHeader vor dem 2-Spalten-Layout gerendert. */
  topServerBlocks?: React.ReactNode
  /** CMM-23: Auftrags-Phase für den Stepper in der linken Sidebar. */
  svPhase?: SvLifecyclePhase
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

      {/* CMM-23: Server-rendered Top-Blocks (Banner, Briefing, Stepper,
          MeinFallStatusCard) — die kommen aus page.tsx mit den Server-Daten. */}
      {props.topServerBlocks && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-3">
          {props.topServerBlocks}
        </div>
      )}

      {/* CMM-23: FallMitteilungenBanner für SV entfernt. */}

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

      {/* CMM-23 Aaron-Layout: links Stepper + Stammdaten; rechts Termin +
          Gutachten + hochgeladene Dokumente. Keine JetztZuTun, keine
          Timeline-Vorschau, keine SvTools, kein Activity-Feed.
          Stellungnahme/Nachbesichtigung/Konfrontation rendern als
          Mitteilungs-Banner oben (topServerBlocks). */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_1fr] gap-4 sm:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start min-w-0">
          {props.svPhase && <AuftragsphaseStepper phase={props.svPhase} />}
          <StammdatenCard lead={lead} fall={fall} kundenbetreuer={kundenbetreuer ?? null} />
          {/* CMM-23: Unfallgegner-Card — Verursacher aus claim_parties /
              parteien (Name + Versicherung + Kennzeichen). Self-gating wenn
              keine Verursacher-Partei vorhanden. */}
          {(() => {
            const verursacher = (props.parteien ?? []).find(
              (p) => (p.rolle as string | null) === 'verursacher',
            )
            if (!verursacher) return null
            const name = (verursacher.name as string | null) ?? null
            const vs = (verursacher.versicherung_name as string | null) ?? null
            const vsNr = (verursacher.versicherung_nr as string | null) ?? null
            if (!name && !vs) return null
            return (
              <div className="rounded-2xl bg-white border border-claimondo-border p-4">
                <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo mb-2">
                  Unfallgegner
                </p>
                <div className="space-y-1.5 text-sm text-claimondo-navy">
                  {name && <p className="font-medium">{name}</p>}
                  {vs && (
                    <p className="text-claimondo-ondo">
                      <span className="text-xs">Versicherung:</span>{' '}
                      <span className="text-claimondo-navy">{vs}</span>
                    </p>
                  )}
                  {vsNr && (
                    <p className="text-claimondo-ondo">
                      <span className="text-xs">VS-Nummer:</span>{' '}
                      <span className="text-claimondo-navy font-mono text-xs">{vsNr}</span>
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
        </aside>

        <section className="space-y-4 min-w-0">
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
          {/* CMM-23: Vorschäden-Hinweis — wenn der Kunde im Lead/Claim
              Vorschäden gemeldet hat, weiß der SV das vor dem Termin und
              kann die nachgereichten Reparaturrechnungen direkt sehen. */}
          {!!fall.hat_vorschaeden && (
            <div className="rounded-2xl bg-amber-50/40 border border-amber-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">⚠️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-claimondo-navy">
                    Vorschäden gemeldet
                  </p>
                  <p className="text-xs text-claimondo-ondo mt-1">
                    Der Kunde hat{' '}
                    <span className="font-medium text-claimondo-navy">
                      {fall.vorschaden_anzahl != null
                        ? `${String(fall.vorschaden_anzahl)} Vorschäden`
                        : 'Vorschäden'}
                    </span>{' '}
                    am Fahrzeug angegeben. Reparaturrechnungen werden — falls
                    vorhanden — über den gelben Banner mit nachgereicht.
                  </p>
                </div>
              </div>
            </div>
          )}
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
          {/* CMM-23: WeitereDokumenteCard ersetzt FallDokumenteSidebar —
              keine Phase/Szenario-Abhängigkeit mehr; einfach die hochgeladenen
              Dokumente + ein Datei-Picker der via uploadDatei den Fall
              (= Claim) erweitert. */}
          <WeitereDokumenteCard
            fallId={fall.id as string}
            dokumente={(props.dokumente ?? []).map((d) => ({
              id: String(d.id),
              dokument_typ: (d.typ as string | null) ?? null,
              datei_url: (d.datei_url as string | null) ?? null,
              datei_name: (d.datei_name as string | null) ?? null,
              hochgeladen_von_rolle: (d.hochgeladen_von_rolle as string | null) ?? null,
              created_at: (d.created_at as string | null) ?? null,
            }))}
          />
        </section>
      </div>

    </div>
  )
}
