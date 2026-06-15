'use client'

// AAR-956 15.06.: vereinheitlicht auf Flow-/Claimondo-Stil. Native Select mit
// Custom-Chevron auf liquidFieldBase-Basis.

import type { OnboardingFeld } from '../types'
import { liquidFieldBase } from '@/lib/styles/liquid-field'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function SelectField({ feld, value, onChange, disabled }: Props) {
  const optionen = feld.optionen ?? []
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      <select
        name={feld.feld_key}
        data-testid={`feld-${feld.feld_key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={feld.pflicht}
        className={`w-full cursor-pointer appearance-none rounded-ios-md px-4 py-3.5 pr-10 text-base ${value ? 'text-claimondo-navy' : 'text-claimondo-ondo'} ${liquidFieldBase}`}
        style={{
          // Custom-Chevron (Claimondo-Ondo), URL-encoded — kein className-Hex.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%234573A2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.9rem center',
        }}
      >
        <option value="">{feld.placeholder ?? 'Bitte wählen'}</option>
        {optionen.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
