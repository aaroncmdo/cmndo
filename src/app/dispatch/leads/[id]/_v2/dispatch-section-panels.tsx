'use client'

// P2d-3 (dispatch-config-unify): Sektion-Injektion (Mechanismus B) — bespoke
// Panels NACH den Feldern einer Sektion im flachen DispatchLeadForm. Anders als
// die Field-Overrides (ein Feld -> eine Rich-Komponente) hängen diese Panels an
// einer SEKTION, nicht an einem einzelnen Feld. Der geteilte FieldRenderer bleibt
// rein (Kunden-Flow!); die Panels sind Dispatcher-only und self-saven jeweils.

import type { ReactNode } from 'react'
import { UnfallskizzeCard } from '../_phases/UnfallskizzeCard'
import { ZeugenKontakteEditor, type ZeugenKontakt } from '../_components/ZeugenKontakteEditor'
import { DispatchWunschterminPanel } from './DispatchWunschterminPanel'
import Phase1PersonenForm from '../_phases/Phase1PersonenForm'
import BkatAnalysePanel from '../_phases/BkatAnalysePanel'
import type { DispatchSectionPanelKey } from './dispatch-section-panel-keys'
import { ParkplatzKameraToggle } from './ParkplatzKameraToggle'
import { SectionCard } from '@/components/shared/SectionCard'
import { CardentityButton } from '@/components/cardentity/CardentityButton'
import { requestCardentityTypBForLead } from '../_actions/cardentity'
import { EigentuemerTypPanel } from './EigentuemerTypPanel'

export type DispatchSectionCtx = {
  leadId: string
  // Volle Lead-Row als Quelle der Initialwerte für die Panels.
  lead: Record<string, unknown>
  // Live-Formwerte (segmented liegen als 'true'/'false'-String vor) — für
  // bedingte Panels wie den Zeugen-Editor (nur wenn zeugen === 'true').
  values: Record<string, unknown>
}

function zeugenKontakteAus(lead: Record<string, unknown>): ZeugenKontakt[] {
  const raw = lead.zeugen_kontakte
  return Array.isArray(raw) ? (raw as ZeugenKontakt[]) : []
}

// Record<DispatchSectionPanelKey, …> erzwingt: Map-Keys == Liste im keys-Modul.
const SEKTION_PANELS: Record<DispatchSectionPanelKey, (ctx: DispatchSectionCtx) => ReactNode[]> = {
  // Unfallhergang: KI-Unfallskizze + (bedingt) Zeugen-Kontakte.
  unfall: (ctx) => {
    const panels: ReactNode[] = [
      <UnfallskizzeCard
        key="unfallskizze"
        leadId={ctx.leadId}
        unfallhergang={(ctx.lead.unfallhergang as string | null) ?? null}
        initialSvg={(ctx.lead.unfallskizze_svg as string | null) ?? null}
        initialBestaetigt={(ctx.lead.unfallskizze_bestaetigt as boolean | null) ?? false}
        initialGeneriertAm={(ctx.lead.unfallskizze_generiert_am as string | null) ?? null}
      />,
    ]
    // Zeugen-Editor nur wenn das (Live-)zeugen-Feld auf Ja steht.
    if (ctx.values.zeugen === 'true') {
      panels.push(
        <ZeugenKontakteEditor
          key="zeugen"
          leadId={ctx.leadId}
          initialKontakte={zeugenKontakteAus(ctx.lead)}
        />,
      )
    }
    return panels
  },
  // Termin & Besichtigung: Wunschtag-Pills (SV-Slot-Filter).
  termin_sv: (ctx) => [
    <DispatchWunschterminPanel
      key="wunschtermin-wochentage"
      leadId={ctx.leadId}
      initialWochentage={
        Array.isArray(ctx.lead.wunschtermin_wochentage)
          ? (ctx.lead.wunschtermin_wochentage as number[])
          : []
      }
    />,
  ],
  // Schaden: bei Personenschaden -> verletzte Personen erfassen (reuse Phase1PersonenForm).
  // BKAT-Analyse: immer angeboten, autoStart=false — kein Auto-Fire beim Mount
  // (Spec §9 / Cardentity-Lehre: paid LLM/OCR-Call nur auf Button-Klick).
  schaden: (ctx) => {
    const nodes: ReactNode[] = []
    if (ctx.values.personenschaden_flag === 'true') {
      nodes.push(<Phase1PersonenForm key="personen" leadId={ctx.leadId} />)
    }
    nodes.push(
      <BkatAnalysePanel
        key="bkat"
        leadId={ctx.leadId}
        autoStart={false}
        polizeiVorOrt={ctx.values.polizei_vor_ort === 'true' ? true : ctx.values.polizei_vor_ort === 'false' ? false : null}
        initialUnfallart={(ctx.lead.bkat_unfallart as string | null) ?? null}
      />,
    )
    if (ctx.values.schadentyp === 'parkplatz') {
      nodes.push(
        <ParkplatzKameraToggle
          key="parkplatz-kamera"
          leadId={ctx.leadId}
          initial={(ctx.lead.parkplatz_kamera as boolean | null) ?? null}
        />,
      )
    }
    return nodes
  },
  // Fahrzeug: Cardentity-Abruf (manuell, ~15-EUR-Confirm, idempotent).
  // Task 6b (Eigentuemer-Typ) haengt hier ebenfalls rein.
  fahrzeug: (ctx) => [
    <SectionCard key="cardentity" title="Fahrzeugdaten & Vorschäden (Cardentity)">
      <CardentityButton
        action={() => requestCardentityTypBForLead(ctx.leadId)}
        finVorhanden={!!ctx.lead.fin}
        initial={{
          fetchedAt: (ctx.lead.cardentity_enriched_at as string | null) ?? null,
          vorschadenVorhanden: (ctx.lead.hat_vorschaeden as boolean | null) ?? null,
          vorschadenAnzahl: (ctx.lead.vorschaden_anzahl as number | null) ?? null,
          letzterVorschadenDatum: (ctx.lead.vorschaden_letzter_datum as string | null) ?? null,
        }}
      />
    </SectionCard>,
    <EigentuemerTypPanel
      key="eigentuemer"
      leadId={ctx.leadId}
      initialFinanzierungLeasing={(ctx.lead.finanzierung_leasing as string | null) ?? null}
      initialVorsteuer={(ctx.lead.vorsteuerabzugsberechtigt as boolean | null) ?? null}
    />,
  ],
}

export function renderDispatchSectionPanels(phaseKey: string, ctx: DispatchSectionCtx): ReactNode[] {
  const fn = SEKTION_PANELS[phaseKey as DispatchSectionPanelKey]
  return fn ? fn(ctx) : []
}
