'use client'

// AAR-289 / AAR-568 (V2): Header für die SV-Fallakte. Breadcrumb + Titel +
// Phasen-Leiste + Akte-Button.
// AAR-727 (fallphasen-glass): Phasen-Leiste nutzt shared FallPhasenPanel
// (variant='header-strip', glass-light). Terminal 'storniert' rendert den
// Badge innerhalb desselben Glass-Panels; 'abgeschlossen' zeigt wie bisher
// die vollständig done-Pipeline.

import Link from 'next/link'
import { ChevronLeftIcon } from 'lucide-react'
import { FallakteDrawer } from './FallakteDrawer'
// AAR-307: Ad-hoc Task-Anlegen aus dem FallHeader
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
import type { SvSubphase } from '@/lib/gutachter/subphase'
// AAR-727: Shared Glass-Panel — ersetzt direkte PhasePipeline + terminal-Pill.
import { FallPhasenPanel } from '@/components/shared/fall-phases'

type DrawerData = Parameters<typeof FallakteDrawer>[0]

export function FallHeader({
  fallNummer,
  fallId,
  kundenName,
  ort,
  subphase,
  drawer,
  aktuellePhaseSnake,
  abgeschlossenAm = null,
}: {
  fallNummer: string
  fallId: string
  kundenName: string
  ort: string
  subphase: SvSubphase
  drawer: DrawerData
  aktuellePhaseSnake: string | null
  /** Optional: abgeschlossen_am für korrekte Phase-10-Markierung im Panel. */
  abgeschlossenAm?: string | null
}) {
  const terminal: 'storniert' | null =
    subphase.code === 'storniert' ? 'storniert' : null

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 sm:px-6 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Link
            href="/gutachter/faelle"
            className="text-gray-500 hover:text-gray-900 mt-0.5 shrink-0"
            aria-label="Zurück zu Fällen"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
              {fallNummer}
              {kundenName && <span className="text-gray-500"> · {kundenName}</span>}
              {ort && <span className="text-gray-500"> · {ort}</span>}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Phase {subphase.phase} {subphase.phaseLabel} · {subphase.label}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <TaskAnlegenButton fallId={fallId} rolle="sachverstaendiger" label="Task" />
          <FallakteDrawer {...drawer} />
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-3">
        <FallPhasenPanel
          fall={{
            id: fallId,
            aktuelle_phase: aktuellePhaseSnake,
            phase_nummer: subphase.phase,
            abgeschlossen_am: abgeschlossenAm,
          }}
          rolle="sv"
          variant="header-strip"
          terminal={terminal}
        />
      </div>
    </div>
  )
}
