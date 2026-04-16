'use client'

// AAR-289: Header für die SV-Fallakte. Breadcrumb + Titel + Phasen-Stepper +
// Akte-Button. Mobile: Stepper horizontal scrollbar.

import Link from 'next/link'
import { ChevronLeftIcon } from 'lucide-react'
import { PhasenStepper } from './PhasenStepper'
import { SubphasenStepper } from './SubphasenStepper'
import { FallakteDrawer } from './FallakteDrawer'
import type { SvSubphase } from '@/lib/gutachter/subphase'

type DrawerData = Parameters<typeof FallakteDrawer>[0]

export function FallHeader({
  fallNummer,
  kundenName,
  ort,
  subphase,
  drawer,
}: {
  fallNummer: string
  kundenName: string
  ort: string
  subphase: SvSubphase
  drawer: DrawerData
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
        <div className="shrink-0">
          <FallakteDrawer {...drawer} />
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-3 space-y-1.5">
        <PhasenStepper currentPhase={subphase.phase} isTerminal={isTerminal} />
        {!isTerminal && <SubphasenStepper currentSubphase={subphase} />}
      </div>
    </div>
  )
}
