// AAR-frontend-konsolidierung-p1: Zentrales Solid-Text-Feld (Label oben + Input
// + optionaler Error/Hint). Ersetzt mehrere inline function Field (Audit R1).
// Native <input>-Passthrough — controlled (value/onChange) wie uncontrolled
// (defaultValue/name) nutzbar. Token-gebunden (claimondo-* → var(--brand-*)).
//
// NICHT die Glass-Variante (shared/glass/GlassInput, onboarding/fields/TextField)
// — die bleibt für die Glass-Flows unangetastet.

import type { InputHTMLAttributes, ReactNode } from 'react'

const INPUT_CLS =
  'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-60'

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label?: ReactNode
  error?: string | null
  hint?: ReactNode
  className?: string
  inputClassName?: string
}

export function TextField({
  label,
  error,
  hint,
  className,
  inputClassName,
  id,
  ...inputProps
}: TextFieldProps) {
  const fieldId =
    id ?? (typeof label === 'string' ? `tf-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label ? (
        <label htmlFor={fieldId} className="text-xs font-semibold text-claimondo-shield">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        className={`${INPUT_CLS} ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : ''} ${inputClassName ?? ''}`}
        {...inputProps}
      />
      {error && error.trim() ? (
        <span className="text-xs text-red-700">{error}</span>
      ) : hint ? (
        <span className="text-xs text-claimondo-shield">{hint}</span>
      ) : null}
    </div>
  )
}
