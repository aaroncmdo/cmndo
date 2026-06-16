'use client'

// AAR-956 15.06.: vereinheitlicht auf Flow-/Claimondo-Stil. Segmented-Control mit
// solidem Ondo-Fill für die aktive Option (statt Glass/Gradient).

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function SegmentedField({ feld, value, onChange, disabled }: Props) {
  const optionen = feld.optionen ?? []
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      <div className="flex w-full min-w-0 gap-1 rounded-ios-md bg-claimondo-navy/[0.06] p-1">
        {optionen.map((opt) => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`feld-${feld.feld_key}-opt-${opt.value}`}
              data-feld={feld.feld_key}
              data-value={opt.value}
              data-active={isActive}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-ios-sm px-3 py-2.5 text-sm font-semibold tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-claimondo-ondo text-white shadow-cta-ondo'
                  : 'text-claimondo-ondo hover:bg-white/60'
              }`}
            >
              {opt.icon && <span className="text-sm leading-none">{opt.icon}</span>}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
