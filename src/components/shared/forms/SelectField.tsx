// AAR-frontend-konsolidierung-p1: Zentrales Solid-Select-Feld (Label oben +
// <select> + optionaler Error/Hint). Pendant zu shared/forms/TextField.
// `options` als {value,label}[] ODER children (eigene <option>s). Token-gebunden.

import type { SelectHTMLAttributes, ReactNode } from 'react'

const SELECT_CLS =
  'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-60'

export type SelectFieldOption = { value: string; label: string; disabled?: boolean }

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label?: ReactNode
  error?: string | null
  hint?: ReactNode
  className?: string
  options?: ReadonlyArray<SelectFieldOption>
}

export function SelectField({
  label,
  error,
  hint,
  className,
  options,
  children,
  id,
  ...rest
}: SelectFieldProps) {
  const fieldId =
    id ?? (typeof label === 'string' ? `sf-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label ? (
        <label htmlFor={fieldId} className="text-xs font-semibold text-claimondo-shield">
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className={`${SELECT_CLS} ${error ? 'border-rose-400' : ''}`}
        {...rest}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      {error && error.trim() ? (
        <span className="text-xs text-rose-700">{error}</span>
      ) : hint ? (
        <span className="text-xs text-claimondo-shield">{hint}</span>
      ) : null}
    </div>
  )
}
