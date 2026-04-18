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
import { FallHeader } from './_components/FallHeader'
import type { TeamMitglied } from './_components/FallakteDrawer'
import { AktuellePhaseCard } from './_components/AktuellePhaseCard'
import { JetztZuTunCard } from './_components/JetztZuTunCard'
import { StammdatenCard } from './_components/StammdatenCard'
import { TerminCard } from './_components/TerminCard'
import { GutachtenCard } from './_components/GutachtenCard'
import { DokumenteUebersichtCard } from './_components/DokumenteUebersichtCard'
import { TimelineVorschauCard } from './_components/TimelineVorschauCard'
import { KanzleiRegulierungsStepperCard } from './_components/KanzleiRegulierungsStepperCard'
import {
  KanzleiStatusCard,
  type KuerzungsPosition,
} from './_components/KanzleiStatusCard'
import { AbrechnungsCard } from './_components/AbrechnungsCard'
import { StellungnahmeCard } from './_components/StellungnahmeCard'
import { NachbesichtigungCard } from './_components/NachbesichtigungCard'
import { ReklamationsCard } from './_components/ReklamationsCard'
import { AbrechnungsartCard } from './_components/AbrechnungsartCard'
import FallakteVollClient from './FallakteVollClient'
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

type FallakteVollProps = Parameters<typeof FallakteVollClient>[0]

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
  fallDokumente?: FallakteVollProps['fallDokumente']
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
  /** AAR-403: Kürzungs-Positionen (forderungspositionen) für KanzleiStatusCard */
  kuerzungen?: KuerzungsPosition[]
  /** AAR-399: Katalog-Slots für SV-Upload (merged mit pflichtdokumente-Status) */
  svSlots?: SvSlotRow[]
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

  return (
    <div className="min-h-full bg-[#f8f9fb]">
      <FallHeader
        fallNummer={fallNummer}
        fallId={fall.id as string}
        kundenName={kundenName}
        ort={ort}
        subphase={subphase}
        drawer={drawerData}
      />

      {/* 2-Spalten-Layout: Desktop ≥1024px sticky-links, Mobile stacked */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_1fr] gap-4 sm:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start min-w-0">
          {/* AAR-377: SV-Briefing ganz oben in der Sidebar — read-only für SV */}
          <BriefingCard
            fallId={fall.id as string}
            briefing={(fall.sv_briefing_text as string | null) ?? null}
            generatedAt={(fall.sv_briefing_generated_at as string | null) ?? null}
            model={(fall.sv_briefing_model as string | null) ?? null}
            version={(fall.sv_briefing_version as number | null) ?? null}
            canRegenerate={false}
            struktur={(() => {
              // AAR-385: Struktur-Briefing aus jsonb — read-only für SV.
              const raw = fall.sv_briefing_struktur as
                | (Record<string, unknown> & { generated_by?: 'ai' | 'fallback' })
                | null
                | undefined
              if (!raw || typeof raw.kurzversion !== 'string') return null
              return {
                kurzversion: raw.kurzversion,
                hinweise: Array.isArray(raw.hinweise)
                  ? (raw.hinweise as string[])
                  : [],
                warnungen: Array.isArray(raw.warnungen)
                  ? (raw.warnungen as string[])
                  : [],
                checkliste_vor_ort: Array.isArray(raw.checkliste_vor_ort)
                  ? (raw.checkliste_vor_ort as string[])
                  : [],
              }
            })()}
            strukturGeneratedBy={
              (fall.sv_briefing_struktur as { generated_by?: 'ai' | 'fallback' } | null)
                ?.generated_by ?? null
            }
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
          {/* AAR-294: Conditional Cards — rendern sich selber nur wenn relevant */}
          <ReklamationsCard
            fall={{
              id: fall.id as string,
              status: (fall.status as string | null) ?? null,
            }}
            id="reklamation-card"
          />
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
          <AktuellePhaseCard
            subphase={subphase}
            fallId={fall.id as string}
            hatTermin={!!(fall.sv_termin as string | null)}
          />
          {/* AAR-315: SV-Post-Termin-Block — self-gating ab Subphase 'vor-ort' */}
          <AbrechnungsartCard
            fall={{
              id: fall.id as string,
              abrechnungsart_besprochen:
                (fall.abrechnungsart_besprochen as 'fiktiv' | 'konkret' | 'noch-offen' | null) ?? null,
              abrechnungsart_notiz: (fall.abrechnungsart_notiz as string | null) ?? null,
              abrechnungsart_besprochen_am:
                (fall.abrechnungsart_besprochen_am as string | null) ?? null,
            }}
            subphase={subphase}
          />
          {/* AAR-293: Kanzlei-Stepper in Phase 5.x */}
          {subphase.phase === 5 && (
            <KanzleiRegulierungsStepperCard
              fall={{
                status: (fall.status as string | null) ?? null,
                kanzlei_uebergeben_am: (fall.kanzlei_uebergeben_am as string | null) ?? null,
              }}
              subphase={subphase}
            />
          )}
          {/* AAR-403: Honorar-Transparenz ab Phase 5 — Kürzungen + SV-Honorar */}
          <KanzleiStatusCard
            subphase={subphase}
            fall={{
              kanzlei_uebergeben_am:
                (fall.kanzlei_uebergeben_am as string | null) ?? null,
              anschlussschreiben_sendedatum:
                (fall.anschlussschreiben_sendedatum as string | null) ?? null,
              vs_reaktion_am: (fall.vs_reaktion_am as string | null) ?? null,
              vs_kuerzung_grund:
                (fall.vs_kuerzung_grund as string | null) ?? null,
              zahlung_eingegangen_am:
                (fall.zahlung_eingegangen_am as string | null) ?? null,
              zahlung_betrag:
                fall.zahlung_betrag != null
                  ? Number(fall.zahlung_betrag as number)
                  : null,
              kuerzungs_betrag:
                fall.kuerzungs_betrag != null
                  ? Number(fall.kuerzungs_betrag as number)
                  : null,
              gutachten_betrag:
                fall.gutachten_betrag != null
                  ? Number(fall.gutachten_betrag as number)
                  : null,
            }}
            abrechnung={props.abrechnung ?? null}
            kuerzungen={props.kuerzungen ?? []}
          />
          {/* AAR-293: Abrechnungs-Card ab Phase 6.x */}
          {subphase.phase === 6 && (
            <AbrechnungsCard abrechnung={props.abrechnung ?? null} subphase={subphase} />
          )}
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
          {/* AAR-293 wird hier Abrechnungs-Block + Kanzlei-Stepper rendern */}
        </section>
      </div>

      {/* AAR-289: Bestehende 7-Tabs-Sicht bleibt vorerst als „Detail-Block"
          unter dem Layout. Children 2/3/4 lösen sie schrittweise auf. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <details className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <summary className="px-4 sm:px-5 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 select-none">
            Vollständige Detail-Ansicht (Tabs öffnen)
          </summary>
          <div className="border-t border-gray-200">
            <FallakteVollClient
              fall={fall}
              lead={lead}
              dokumente={dokumente}
              pflichtdokumente={pflichtdokumente as unknown as Record<string, unknown>[]}
              parteien={props.parteien}
              timeline={timeline as unknown as Record<string, unknown>[]}
              nachrichten={nachrichten}
              kundenbetreuer={kundenbetreuer ?? null}
              chatTeilnehmer={props.chatTeilnehmer}
              aktiverTermin={props.aktiverTermin}
              fallDokumente={props.fallDokumente}
            />
          </div>
        </details>
      </div>
    </div>
  )
}
