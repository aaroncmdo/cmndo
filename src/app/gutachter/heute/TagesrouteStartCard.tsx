'use client'

// AAR-381: „Tagesroute starten" — Einstieg in den Fokus-Modus (AAR-382).
// Ruft ensureTagesSession und navigiert zu /gutachter/feldmodus.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapIcon, PlayCircleIcon } from 'lucide-react'
import { startOrResumeTagesSession } from './actions'

export interface TagesrouteStartCardProps {
  terminIds: string[]
  /** Falls bereits laufende Session existiert: label-Switch. */
  hasActiveSession: boolean
  /** Disabled wenn keine aktiven Termine oder Portal nicht freigeschaltet. */
  disabledReason?: string | null
  /** Grobe Schätzung der Fahrzeit (Minuten) — null zeigt einfach Stop-Count. */
  geschaetzteFahrzeitMinuten?: number | null
}

export default function TagesrouteStartCard({
  terminIds,
  hasActiveSession,
  disabledReason,
  geschaetzteFahrzeitMinuten = null,
}: TagesrouteStartCardProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = Boolean(disabledReason) || pending || terminIds.length === 0

  async function handleStart() {
    setPending(true)
    setError(null)
    const res = await startOrResumeTagesSession(terminIds)
    setPending(false)
    if (!res.success) {
      setError(res.error ?? 'Fehler beim Start')
      return
    }
    router.push('/gutachter/feldmodus')
  }

  const label = hasActiveSession
    ? 'Fokus-Modus fortsetzen'
    : 'Tagesroute starten'

  const subLabel =
    geschaetzteFahrzeitMinuten != null
      ? `${terminIds.length} Stops · ca. ${Math.round(geschaetzteFahrzeitMinuten / 60)}h ${geschaetzteFahrzeitMinuten % 60}min`
      : `${terminIds.length} Stops`

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-primary)] p-4 text-white shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <MapIcon className="w-4 h-4 text-[var(--brand-accent)]" />
        <h3 className="text-sm font-semibold">Tagesroute</h3>
      </div>
      <p className="text-xs text-gray-300 mb-3">{subLabel}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={handleStart}
        title={disabledReason ?? undefined}
        className={`w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
          disabled
            ? 'bg-white/10 text-gray-300 cursor-not-allowed'
            : 'bg-[var(--brand-secondary)] hover:bg-[var(--brand-accent)] text-white'
        }`}
      >
        <PlayCircleIcon className="w-4 h-4" />
        {pending ? 'Starte …' : label}
      </button>
      {error && (
        <p className="text-[11px] text-red-300 mt-2">Fehler: {error}</p>
      )}
    </div>
  )
}
