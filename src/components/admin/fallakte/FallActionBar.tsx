'use client'

// AAR-567 (V1): Action-Bar oberhalb der Tab-Bar — ersetzt Teile des alten
// PhaseHeader. Enthält die funktionalen Buttons (Status-Override, Kanzlei-
// Paket, Phase vorrücken) + ein Diagnose-Drawer für Trigger-Felder.
// Die Phasen-Darstellung wandert in die linke <PhasePipeline />-Spalte.

import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
import { PhaseTriggerList } from './PhaseTriggerList'
import { KanzleiPaketModal } from './KanzleiPaketModal'
import { ManualStatusOverrideModal } from './ManualStatusOverrideModal'
import { ManualPhaseOverrideModal } from './ManualPhaseOverrideModal'
import { useFall } from '@/app/faelle/[id]/FallContext'

const SZENARIO_LABEL: Record<string, string> = {
  normalfall: 'Normalfall',
  ruegefall: 'Rügefall',
  klagefall: 'Klagefall',
  bewertung: 'Bewertung',
  haftpflicht_eindeutig: 'HP eindeutig',
  haftpflicht_strittig: 'HP strittig',
  leasingrueckgabe: 'Leasing-Rückgabe',
  totalschaden: 'Totalschaden',
  gerichtsgutachten: 'Gerichtsgutachten',
}

export function FallActionBar({ result, fallId }: { result: SubphaseResult; fallId: string }) {
  const { fall, userRolle } = useFall()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [paketOpen, setPaketOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [phaseOverrideOpen, setPhaseOverrideOpen] = useState(false)

  const isAdmin = userRolle === 'admin'
  const currentStatus = fall.status ?? 'unbekannt'
  const currentSubphase = (fall as { aktuelle_phase?: string | null }).aktuelle_phase ?? null

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {result.szenario && (
            <span className="text-xs bg-amber-50 text-amber-800 rounded px-1.5 py-0.5">
              {SZENARIO_LABEL[result.szenario] ?? result.szenario}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTriggerOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#4573A2]"
          >
            {triggerOpen ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            {result.trigger_fields.length} Trigger-
            {result.trigger_fields.length === 1 ? 'Feld' : 'Felder'}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setOverrideOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 hover:bg-amber-100 text-amber-900"
              title="Status manuell überschreiben (Admin-only, umgeht State-Machine)"
            >
              <AlertTriangleIcon className="w-3.5 h-3.5" />
              Status-Override
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaketOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:bg-gray-50 text-[#0D1B3E]"
          >
            <InboxIcon className="w-3.5 h-3.5" />
            Kanzlei-Paket einlesen
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setPhaseOverrideOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[#0D1B3E] text-white px-2.5 py-1.5 hover:bg-[#162857]"
              title="Subphase manuell überschreiben (Admin-only, umgeht Subphase-Resolver)"
            >
              Phase vorrücken
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {triggerOpen && (
        <div className="px-4 sm:px-6 pb-3">
          <div className="bg-[#f8f9fb] border border-gray-200 rounded-md px-3 py-2">
            <PhaseTriggerList fields={result.trigger_fields} />
          </div>
        </div>
      )}

      <KanzleiPaketModal
        open={paketOpen}
        onOpenChange={setPaketOpen}
        fallId={fallId}
        phase={result.phase}
        subphase={result.subphase}
      />

      {isAdmin && (
        <>
          <ManualStatusOverrideModal
            open={overrideOpen}
            onOpenChange={setOverrideOpen}
            fallId={fallId}
            currentStatus={currentStatus}
          />
          <ManualPhaseOverrideModal
            open={phaseOverrideOpen}
            onOpenChange={setPhaseOverrideOpen}
            fallId={fallId}
            currentSubphase={currentSubphase}
          />
        </>
      )}
    </div>
  )
}
