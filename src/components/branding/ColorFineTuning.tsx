'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import type { BrandThemeV2 } from '@/lib/branding/theme'

// AAR-422: Aufklappbares Feintuning-Panel mit 5 nativen Color-Pickern
// (primary/secondary/accent/background/border). react-colorful ist nicht
// installed — native <input type=color> reicht für den Override-Fall.
//
// onChange liefert nur den geänderten Key — die Parent-Komponente (BrandingEditor)
// entscheidet ob sie das ganze Theme mit themeFromLegacy() neu ableitet oder
// nur den einzelnen Token überschreibt.

type Tunable = 'primary' | 'secondary' | 'accent' | 'background' | 'border'

type Props = {
  theme: Pick<BrandThemeV2, Tunable>
  onChange: (key: Tunable, hex: string) => void
}

const ROWS: Array<{ key: Tunable; label: string; hint: string }> = [
  { key: 'primary', label: 'Primär', hint: 'Buttons, Headlines, Sidebar' },
  { key: 'secondary', label: 'Sekundär', hint: 'Akzente, Active-States' },
  { key: 'accent', label: 'Accent', hint: 'Hover, Links' },
  { key: 'background', label: 'Hintergrund', hint: 'App-Background' },
  { key: 'border', label: 'Rand', hint: 'Borders, Divider' },
]

export default function ColorFineTuning({ theme, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
      >
        <div>
          <span className="text-sm font-medium text-gray-900">Feintuning</span>
          <p className="text-[11px] text-gray-500 mt-0.5">Optional — Farben manuell anpassen</p>
        </div>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          {ROWS.map(row => (
            <div key={row.key} className="flex items-center gap-3">
              <label className="flex-1">
                <span className="text-sm text-gray-700 font-medium">{row.label}</span>
                <span className="text-[11px] text-gray-500 ml-2">{row.hint}</span>
              </label>
              <input
                type="color"
                value={theme[row.key]}
                onChange={e => onChange(row.key, e.target.value.toUpperCase())}
                className="w-10 h-9 rounded border border-gray-200 cursor-pointer"
                aria-label={`${row.label} wählen`}
              />
              <input
                type="text"
                value={theme[row.key]}
                onChange={e => {
                  const v = e.target.value.trim()
                  if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(row.key, v.toUpperCase())
                }}
                className="w-24 px-2 py-1.5 text-xs font-mono border border-gray-200 rounded"
                maxLength={7}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
