'use client'

import type { LayerKey } from '@/lib/dispatch/karte/types'

type Props = {
  visibility: Record<LayerKey, boolean>
  counts: Record<LayerKey, number>
  onToggle: (key: LayerKey) => void
}

const CHIPS: Array<{ key: LayerKey; label: string; emoji: string }> = [
  { key: 'leads', label: 'Leads', emoji: '🧑' },
  { key: 'svs', label: 'SVs', emoji: '🛠' },
  { key: 'termine', label: 'Termine', emoji: '📅' },
]

export default function LayerChipBar({ visibility, counts, onToggle }: Props) {
  return (
    <div className="absolute left-3 top-3 z-20 flex gap-2">
      {CHIPS.map(({ key, label, emoji }) => {
        const active = visibility[key]
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-ios-md px-3 py-1.5 text-xs font-medium shadow-ios-sm transition-colors ${
              active
                ? 'bg-claimondo-navy text-white hover:bg-claimondo-navy/90'
                : 'bg-white/95 text-claimondo-navy/60 backdrop-blur hover:bg-claimondo-bg'
            }`}
          >
            <span aria-hidden>{emoji}</span>
            <span>{label}</span>
            <span
              className={`rounded-ios-sm px-1.5 py-0.5 text-[10px] ${
                active ? 'bg-white/20' : 'bg-claimondo-bg'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
