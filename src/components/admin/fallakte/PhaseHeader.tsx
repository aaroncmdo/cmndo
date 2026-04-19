'use client'

// AAR-538 (C1): Sticky Phase-Header oben in der Admin-Fallakte.
// Zeigt Phase+Subphase+Label, Szenario-Badge, Trigger-Felder (collapsible).
// AAR-539 (C2): „Kanzlei-Paket einlesen" öffnet KanzleiPaketModal.
// AAR-560 (C11): „Status-Override" öffnet ManualStatusOverrideModal (Admin-only).

import { useState } from 'react'
import { toast } from 'sonner'
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
import { useFall } from '@/app/admin/faelle/[id]/FallContext'

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

export function PhaseHeader({ result, fallId }: { result: SubphaseResult; fallId: string }) {
  const { fall, userRolle } = useFall()
  const [open, setOpen] = useState(false)
  const [paketOpen, setPaketOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  const isAdmin = userRolle === 'admin'
  const currentStatus = fall.status ?? 'unbekannt'

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="px-4 sm:px-6 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-[#4573A2] bg-[#EBF1F8] rounded px-1.5 py-0.5">
                Phase {result.phase} · {result.subphase}
              </span>
              <h2 className="text-base font-semibold text-[#0D1B3E] truncate">{result.label}</h2>
              {result.szenario && (
                <span className="text-xs bg-amber-50 text-amber-800 rounded px-1.5 py-0.5">
                  {SZENARIO_LABEL[result.szenario] ?? result.szenario}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium text-[#0D1B3E]">Nächster Schritt:</span> {result.next_hint}
            </p>
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
            <button
              type="button"
              onClick={() => toast.info('Phase vorrücken: kommt mit AAR-540 (C3)')}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[#0D1B3E] text-white px-2.5 py-1.5 hover:bg-[#162857]"
            >
              Phase vorrücken
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#4573A2]"
        >
          {open ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          {result.trigger_fields.length} Trigger-{result.trigger_fields.length === 1 ? 'Feld' : 'Felder'} erkannt
        </button>
        {open && (
          <div className="mt-2 bg-[#f8f9fb] border border-gray-200 rounded-md px-3 py-2">
            <PhaseTriggerList fields={result.trigger_fields} />
          </div>
        )}
      </div>

      <KanzleiPaketModal
        open={paketOpen}
        onOpenChange={setPaketOpen}
        fallId={fallId}
        phase={result.phase}
        subphase={result.subphase}
      />

      {isAdmin && (
        <ManualStatusOverrideModal
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          fallId={fallId}
          currentStatus={currentStatus}
        />
      )}
    </div>
  )
}
