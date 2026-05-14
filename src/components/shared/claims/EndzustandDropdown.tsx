'use client'

// AAR-840: Endzustand-Dropdown für ActionBar-Slot des FallIdentityHeader
//
// Sichtbar für Admin (immer) und KB (nur wenn claim.kundenbetreuer_id = current).
// Bei Endzustand-Status: Button disabled mit Tooltip „Bereits final".

import { useEffect, useRef, useState } from 'react'
import {
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ScaleIcon,
  PauseCircleIcon,
  PhoneCallIcon,
} from 'lucide-react'
import { EndzustandModal, type EndzustandMode } from './EndzustandModal'
import { getStatusMapping } from './status-mappings'

type Props = {
  claimId: string
  currentStatus: string
  /** Rolle des aktuellen Users — bestimmt Sichtbarkeit */
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde'
}

const ITEMS: { mode: EndzustandMode; label: string; icon: typeof CheckCircleIcon; tone: string }[] = [
  { mode: 'reguliert',           label: 'Reguliert',           icon: CheckCircleIcon, tone: 'text-emerald-700' },
  { mode: 'abgelehnt',           label: 'Abgelehnt',           icon: XCircleIcon,     tone: 'text-red-700' },
  { mode: 'storniert',           label: 'Stornieren',          icon: PauseCircleIcon, tone: 'text-claimondo-light-blue' },
  { mode: 'in_kommunikation_vs', label: 'In Kommunikation mit VS', icon: PhoneCallIcon, tone: 'text-claimondo-ondo' },
]

export function EndzustandDropdown({ claimId, currentStatus, viewerRole }: Props) {
  const [open, setOpen] = useState(false)
  const [modalMode, setModalMode] = useState<EndzustandMode | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const isAuthorized = viewerRole === 'admin' || viewerRole === 'kb'
  const statusMapping = getStatusMapping(currentStatus)
  const isAlreadyFinal = statusMapping.isEndzustand

  // Outside-Click schließt Dropdown
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!isAuthorized) return null

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => !isAlreadyFinal && setOpen(!open)}
          disabled={isAlreadyFinal}
          title={isAlreadyFinal ? 'Claim ist bereits in einem Endzustand' : 'Endzustand setzen'}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-ios-lg border text-xs font-medium transition-colors ${
            isAlreadyFinal
              ? 'bg-claimondo-bg border-claimondo-border text-claimondo-light-blue cursor-not-allowed'
              : 'bg-white border-claimondo-border text-claimondo-navy hover:bg-claimondo-bg'
          }`}
        >
          Endzustand
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        {open && !isAlreadyFinal && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-claimondo-border rounded-ios-xl shadow-lg z-20 py-1">
            {ITEMS.slice(0, 3).map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => { setOpen(false); setModalMode(item.mode) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-claimondo-navy hover:bg-claimondo-bg text-left"
              >
                <item.icon className={`w-4 h-4 ${item.tone}`} />
                {item.label}
              </button>
            ))}
            <div className="border-t border-claimondo-border my-1" />
            <button
              type="button"
              onClick={() => { setOpen(false); setModalMode('in_kommunikation_vs') }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-claimondo-ondo hover:bg-claimondo-bg text-left"
            >
              <PhoneCallIcon className="w-3.5 h-3.5" />
              In Kommunikation mit VS (Phase 6)
            </button>
          </div>
        )}
      </div>

      {modalMode && (
        <EndzustandModal
          open={modalMode !== null}
          onClose={() => setModalMode(null)}
          claimId={claimId}
          mode={modalMode}
        />
      )}
    </>
  )
}
