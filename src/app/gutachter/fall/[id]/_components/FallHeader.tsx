'use client'

// AAR-289 / AAR-568 (V2): Header für die SV-Fallakte. Breadcrumb + Titel +
// <PhasePipeline /> (horizontal, rolle='sv') + Akte-Button.
// Die alten PhasenStepper / SubphasenStepper sind entfernt — die shared
// PhasePipeline-Library zeigt dem SV jetzt alle 10 Phasen (mit Rollen-
// Sichtbarkeits-Filter aus subphase-visibility.ts).

import Link from 'next/link'
import { ChevronLeftIcon } from 'lucide-react'
import { FallakteDrawer } from './FallakteDrawer'
// AAR-307: Ad-hoc Task-Anlegen aus dem FallHeader
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
import type { SvSubphase } from '@/lib/gutachter/subphase'
// AAR-568 (V2): Shared PhasePipeline ersetzt die SV-eigenen Stepper.
import { PhasePipeline } from '@/components/shared/fall-phases'
import type { PhaseStepData } from '@/components/shared/fall-phases'

type DrawerData = Parameters<typeof FallakteDrawer>[0]

export function FallHeader({
  fallNummer,
  fallId,
  kundenName,
  ort,
  subphase,
  drawer,
  pipelinePhases,
  aktuellePhaseSnake,
}: {
  fallNummer: string
  fallId: string
  kundenName: string
  ort: string
  subphase: SvSubphase
  drawer: DrawerData
  // AAR-568 (V2): vorberechnete Pipeline-Daten aus buildPhasePipelineData().
  pipelinePhases: PhaseStepData[]
  aktuellePhaseSnake: string | null
}) {
  const isTerminal: 'abgeschlossen' | 'storniert' | undefined =
    subphase.code === 'storniert'
      ? 'storniert'
      : subphase.code === 'honorar-ueberwiesen'
        ? 'abgeschlossen'
        : undefined

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

      {isTerminal === 'storniert' ? (
        <div className="px-4 sm:px-6 pb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium w-fit">
            Fall storniert
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-6 pb-3">
          <PhasePipeline
            fall={{ id: fallId, aktuelle_phase: aktuellePhaseSnake }}
            rolle="sv"
            phases={pipelinePhases}
            variant="horizontal"
          />
        </div>
      )}
    </div>
  )
}
