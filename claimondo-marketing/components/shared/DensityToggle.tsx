'use client'

// 2026-05-07 Design-Review Item 1.5: 2-Mode-Toggle (Comfortable/Compact)
// fuer Listen. Persistiert ueber useDensityPreference. Wird neben
// Filter-Bars o. ae. platziert.

import { Rows3Icon, AlignJustifyIcon } from 'lucide-react'
import { useDensityPreference, type Density } from '@/hooks/useDensityPreference'

type Props = {
  /** Stable Listen-Schluessel fuer localStorage, z.B. 'dispatch-leads'. */
  listKey: string
  /** Optionaler Render-Prop fuer Custom-Layout — sonst Standard-Toggle. */
  className?: string
}

export default function DensityToggle({ listKey, className = '' }: Props) {
  const [density, setDensity] = useDensityPreference(listKey)
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-ios-lg border border-claimondo-border bg-white p-0.5 ${className}`}
      role="group"
      aria-label="Listen-Dichte"
    >
      <button
        type="button"
        onClick={() => setDensity('comfortable')}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-ios-md text-[11px] font-medium transition-colors ${
          density === 'comfortable'
            ? 'bg-claimondo-navy text-white'
            : 'text-claimondo-ondo hover:text-claimondo-navy'
        }`}
        title="Komfortabel"
        aria-pressed={density === 'comfortable'}
      >
        <Rows3Icon className="w-3 h-3" />
        <span className="hidden sm:inline">Komfort</span>
      </button>
      <button
        type="button"
        onClick={() => setDensity('compact')}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-ios-md text-[11px] font-medium transition-colors ${
          density === 'compact'
            ? 'bg-claimondo-navy text-white'
            : 'text-claimondo-ondo hover:text-claimondo-navy'
        }`}
        title="Kompakt"
        aria-pressed={density === 'compact'}
      >
        <AlignJustifyIcon className="w-3 h-3" />
        <span className="hidden sm:inline">Kompakt</span>
      </button>
    </div>
  )
}

export { type Density }
