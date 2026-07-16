// AAR-frontend-konsolidierung-p1: Zentrales Solid-Text-Feld (Label oben + Input
// + optionaler Error/Hint). Ersetzt mehrere inline function Field (Audit R1).
// Native <input>-Passthrough — controlled (value/onChange) wie uncontrolled
// (defaultValue/name) nutzbar. Token-gebunden (claimondo-* → var(--brand-*)).
//
// NICHT die Glass-Variante (shared/glass/GlassInput, onboarding/fields/TextField)
// — die bleibt für die Glass-Flows unangetastet.

import { useId } from 'react'
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
  // Instanz-eindeutig via useId (SSR-stabil) statt Label-Slug: `tf-kennzeichen` stand doppelt im
  // DOM, sobald dasselbe Label zweimal gerendert wird (z.B. Drawer-Review ueber dem Seiten-Formular
  // -- ZB1-Prod-Smoke-Befund 16.07.). Duplikat-IDs brechen htmlFor-Zuordnung + a11y. Explizite
  // id-Prop behaelt Vorrang; ReactNode-Labels bekommen jetzt ebenfalls eine htmlFor-Bindung.
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label ? (
        <label htmlFor={fieldId} className="text-xs font-semibold text-claimondo-shield">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        className={`${INPUT_CLS} ${error ? 'border-danger focus:border-danger focus:ring-danger/30' : ''} ${inputClassName ?? ''}`}
        {...inputProps}
      />
      {error && error.trim() ? (
        <span className="text-xs text-danger-strong">{error}</span>
      ) : hint ? (
        <span className="text-xs text-claimondo-shield">{hint}</span>
      ) : null}
    </div>
  )
}
