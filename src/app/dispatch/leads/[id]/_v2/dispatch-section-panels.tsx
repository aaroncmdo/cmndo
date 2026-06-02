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
import type { DispatchSectionPanelKey } from './dispatch-section-panel-keys'

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
}

export function renderDispatchSectionPanels(phaseKey: string, ctx: DispatchSectionCtx): ReactNode[] {
  const fn = SEKTION_PANELS[phaseKey as DispatchSectionPanelKey]
  return fn ? fn(ctx) : []
}
