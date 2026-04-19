// AAR-565 (B2): Status-Indikator-Dot für Phase-Components.
// Keine Hex-Werte — Claimondo-Tokens + Tailwind-Semantik-Utilities.

import type { PhaseState } from './types'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
}

const STATE_CLASSES: Record<PhaseState, string> = {
  upcoming: 'bg-claimondo-border',
  active: 'bg-claimondo-ondo ring-2 ring-claimondo-ondo/30 animate-pulse',
  done: 'bg-emerald-500',
  blocked: 'bg-rose-500',
  skipped: 'bg-gray-300',
  hidden: 'bg-transparent',
}

const STATE_LABEL: Record<PhaseState, string> = {
  upcoming: 'Ausstehend',
  active: 'Aktiv',
  done: 'Abgeschlossen',
  blocked: 'Blockiert',
  skipped: 'Übersprungen',
  hidden: 'Ausgeblendet',
}

export function PhaseStatusDot({ state, size = 'sm', showLabel = false }: {
  state: PhaseState
  size?: Size
  showLabel?: boolean
}) {
  if (state === 'hidden') return null
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={STATE_LABEL[state]}>
      <span
        className={`rounded-full ${SIZE_CLASSES[size]} ${STATE_CLASSES[state]}`}
        role="status"
      />
      {showLabel && (
        <span className="text-[11px] text-gray-500">{STATE_LABEL[state]}</span>
      )}
    </span>
  )
}
