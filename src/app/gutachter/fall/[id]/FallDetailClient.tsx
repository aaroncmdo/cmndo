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
import { AktuellePhaseCard } from './_components/AktuellePhaseCard'
import { StammdatenCard } from './_components/StammdatenCard'
import { DokumenteUebersichtCard } from './_components/DokumenteUebersichtCard'
import { TimelineVorschauCard } from './_components/TimelineVorschauCard'
import FallakteVollClient from './FallakteVollClient'

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

  const drawerData = {
    fallNummer,
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
        kundenName={kundenName}
        ort={ort}
        subphase={subphase}
        drawer={drawerData}
      />

      {/* 2-Spalten-Layout: Desktop ≥1024px sticky-links, Mobile stacked */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_1fr] gap-4 sm:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start min-w-0">
          <AktuellePhaseCard subphase={subphase} />
          {/* AAR-291 wird hier ein Task-Widget ergänzen */}
        </aside>

        <section className="space-y-4 min-w-0">
          <StammdatenCard lead={lead} fall={fall} kundenbetreuer={kundenbetreuer ?? null} />
          <DokumenteUebersichtCard
            pflichtdokumente={pflichtdokumente}
            totalDokumente={sichtbarDokumente.length + (sichtbarFallDokumente?.length ?? 0)}
          />
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
