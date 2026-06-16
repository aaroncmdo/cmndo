'use client'

// AAR-956 15.06.: vereinheitlicht auf Flow-/Claimondo-Stil. Checkbox-Card solide.

import { Check } from 'lucide-react'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: boolean
  onChange: (val: boolean) => void
  disabled?: boolean
}

export function CheckboxField({ feld, value, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      data-testid={`feld-${feld.feld_key}`}
      data-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`flex w-full min-w-0 items-center gap-3 rounded-ios-md border px-4 py-3.5 text-left transition-all duration-200 disabled:cursor-not-allowed ${
        value
          ? 'border-claimondo-ondo bg-claimondo-ondo/5'
          : 'border-claimondo-border bg-white hover:bg-claimondo-bg'
      }`}
    >
      <span
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded border-[1.5px] transition-all ${
          value ? 'border-claimondo-ondo bg-claimondo-ondo' : 'border-claimondo-border bg-white'
        }`}
      >
        <Check size={11} className={value ? 'text-white' : 'text-transparent'} strokeWidth={3} />
      </span>
      <span
        className="text-[12.5px] leading-snug text-claimondo-navy/80"
        dangerouslySetInnerHTML={{ __html: feld.label }}
      />
    </button>
  )
}
