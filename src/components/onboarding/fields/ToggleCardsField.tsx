'use client'

// AAR-956 15.06.: vereinheitlicht auf Flow-/Claimondo-Stil. Auswahl-Cards solide
// (aktiv = Ondo-Border + dezenter Ondo-Tint), statt Glass/Gradient.

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function ToggleCardsField({ feld, value, onChange, disabled }: Props) {
  const optionen = feld.optionen ?? []
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      <div className="flex flex-col gap-2.5">
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
              className={`flex w-full min-w-0 items-center gap-3.5 rounded-ios-md border px-5 py-4 text-left transition-all duration-200 disabled:cursor-not-allowed ${
                isActive
                  ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                  : 'border-claimondo-border bg-white hover:border-claimondo-ondo/40 hover:bg-claimondo-bg'
              }`}
            >
              {opt.icon && <span className="shrink-0 text-[22px] leading-none">{opt.icon}</span>}
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="text-[15px] font-bold tracking-[-.012em] text-claimondo-navy">
                  {opt.label}
                </strong>
                {opt.description && (
                  <span className="text-[12.5px] leading-relaxed text-claimondo-ondo">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
