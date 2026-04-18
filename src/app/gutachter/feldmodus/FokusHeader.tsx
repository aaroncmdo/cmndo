'use client'

// AAR-382: Header-Leiste im Fokus-Modus.
// Links: Exit-Button (pausiert Session, navigiert zurück nach /gutachter/heute).
// Mitte: „Stop X/Y" + optionale ETA/Distance-Anzeige.
// Rechts: kompakte Session-Status-Badge.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XIcon, GaugeIcon } from 'lucide-react'
import type { SessionStatus } from '@/lib/types/field-modus'
import { pauseFokusmodus } from './actions'

export interface FokusHeaderProps {
  sessionId: string
  sessionStatus: SessionStatus
  aktuellerIndex: number
  totalStops: number
  distanceMeters: number | null
}

function formatDistance(m: number | null): string | null {
  if (m == null) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'idle':
      return 'Bereit'
    case 'en_route':
      return 'Unterwegs'
    case 'arrived':
      return 'Vor Ort'
    case 'completing':
      return 'Schließe ab'
    case 'finished':
      return 'Fertig'
    case 'paused':
      return 'Pausiert'
  }
}

export default function FokusHeader({
  sessionId,
  sessionStatus,
  aktuellerIndex,
  totalStops,
  distanceMeters,
}: FokusHeaderProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onExit() {
    startTransition(async () => {
      const res = await pauseFokusmodus(sessionId)
      if (res.success) {
        router.push('/gutachter/heute?info=Fokus-Modus+pausiert')
      } else {
        toast.error(res.error ?? 'Pausieren fehlgeschlagen')
      }
    })
  }

  const distLabel = formatDistance(distanceMeters)

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[var(--brand-primary)] border-b border-white/10">
      <button
        type="button"
        onClick={onExit}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2 py-1.5 text-xs text-white disabled:opacity-50"
        aria-label="Fokus-Modus pausieren"
      >
        <XIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Pausieren</span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-white">
          <span className="text-sm font-semibold">
            Stop {Math.min(aktuellerIndex + 1, totalStops)}/{totalStops}
          </span>
          {distLabel && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-300">
              <GaugeIcon className="w-3.5 h-3.5" />
              {distLabel}
            </span>
          )}
        </div>
      </div>

      <span className="text-[10px] uppercase tracking-wider rounded-full bg-[color:var(--brand-primary,var(--brand-secondary))]/20 text-[color:var(--brand-primary,var(--brand-accent))] px-2 py-1">
        {statusLabel(sessionStatus)}
      </span>
    </div>
  )
}
