'use client'

// AAR-956 15.06. (Aaron): Feld-Design vereinheitlicht auf den Flow-/Claimondo-Stil
// (liquidFieldBase + Navy-Label) statt Liquid-Glass — konsistent mit den SA-/Flow-
// Steps UND der Dispatch-Maske (geteilte Komponente, daher beide Seiten auf einmal).

import type { OnboardingFeld } from '../types'
import { liquidFieldBase } from '@/lib/styles/liquid-field'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function TextField({ feld, value, onChange, disabled }: Props) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      <input
        type={feld.typ === 'number' ? 'number' : feld.typ}
        name={feld.feld_key}
        data-testid={`feld-${feld.feld_key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={feld.placeholder ?? ''}
        disabled={disabled}
        required={feld.pflicht}
        className={`w-full rounded-ios-md px-4 py-3.5 text-base ${liquidFieldBase}`}
      />
    </div>
  )
}
