'use client'

// AAR-162 / W2: Übersicht-Tab — Status + Stammdaten-Sections.
// Sichtbare Sektionen kommen aus FallContext.visibleSections (phase-config).
// Section-Id → Section-Component Mapping hier, damit die Reihenfolge im Tab
// konsistent mit der Notion-Spec bleibt (kunde → fahrzeug → unfall → gegner
// → vorschaeden → besichtigung → kernwerte → as-status).

import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'
import { useFall } from '../FallContext'
import type { StammdatenSection } from '@/lib/fall/phase-config'
import {
  KundendatenSection,
  FahrzeugdatenSection,
  UnfallSection,
  GegnerSection,
  VorschaedenSection,
  BesichtigungSection,
  KernwerteSection,
  VsStatusSection,
} from '../stammdaten/Sections'

const SECTION_COMPONENTS: Partial<Record<StammdatenSection, () => React.JSX.Element>> = {
  kunde: KundendatenSection,
  fahrzeug: FahrzeugdatenSection,
  unfall: UnfallSection,
  gegner: GegnerSection,
  vorschaeden: VorschaedenSection,
  besichtigung: BesichtigungSection,
  kernwerte: KernwerteSection,
  'as-status': VsStatusSection,
  // kuerzung/ruege/stellungnahme/nachbesichtigung/regulierung/klage/auszahlung
  // → werden im ProzessTab (W4) gerendert, nicht in der Übersicht
}

export default function UebersichtTab() {
  const { fall, visibleSections } = useFall()
  const status = fall.status ?? 'ersterfassung'
  const statusLabel = FALL_STATUS_LABELS[status] ?? status
  const statusCls =
    FALL_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="space-y-4">
      {/* Status-Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Fall-Nummer</p>
          <h1 className="text-xl font-bold text-gray-900">{fall.fall_nummer ?? fall.id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium px-2 py-1 rounded-full border ${statusCls}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Stammdaten — phase-abhängige Reihenfolge */}
      {visibleSections.map((id) => {
        const Comp = SECTION_COMPONENTS[id]
        if (!Comp) return null
        return <Comp key={id} />
      })}
    </div>
  )
}
