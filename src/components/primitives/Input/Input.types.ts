// AAR-769 Phase 4: Input-Primitive (Atom-Layer).
// Liquid-Glass-Inputstil aus dispatch/leads/_phases/Phase2TerminServiceTyp.tsx
// (Aaron-Design 2026-03): tint-Background + Focus-bg-white + ondo-Border-Highlight
// + focus-shadow-ondo. Web nutzt <input>, Native würde TextInput verwenden.
//
// Web/Native-Asymmetrien (siehe AGENTS.md §Komponenten-Set):
//   - `inputType` mapped Web auf `type=` (z. B. 'datetime-local', 'email'),
//     auf Native ist es ein no-op (RN TextInput hat eigene keyboardType-Props).
//   - `onChangeText(value)` ist die plattform-neutrale Schreibweise (Native-Style).
//     Web-Consumer dürfen alternativ `onChange(e)` nutzen (Escape-Hatch).

import type { ChangeEvent } from 'react'

export type InputSize = 'sm' | 'md' | 'lg'

/** Web-Input-Type — auf Native als Hint, dort ignoriert. */
export type InputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'password'
  | 'search'
  | 'date'
  | 'time'
  | 'datetime-local'

export type InputProps = {
  value: string
  /** Plattform-neutral — bekommt nur den neuen Wert. */
  onChangeText: (value: string) => void
  /** Web-Escape-Hatch: nativer Change-Event (z. B. wenn man `e.target.validity` braucht). */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  /** Web only — HTML-type. Default 'text'. */
  inputType?: InputType
  placeholder?: string
  disabled?: boolean
  /** Höhe (default 'md' = 44px Touchmin). */
  size?: InputSize
  /** Vollbreit innerhalb des Containers. Default true. */
  fullWidth?: boolean
  /** Min-Wert (für date/time/number). Web only. */
  min?: string | number
  /** Max-Wert. Web only. */
  max?: string | number
  /** Web only — name-Attribut für native <form>-Submit. */
  name?: string
  /** Accessible Label (Pflicht falls kein sichtbares <label> existiert). */
  ariaLabel?: string
  /** Web-Escape-Hatch für Sonderfälle. Native ignoriert es. */
  className?: string
  /** Web only — autoFocus on mount. */
  autoFocus?: boolean
  /** HTML required-Attribut (Web only — Native macht eigene Validation). */
  required?: boolean
  /** Web only — Max-Länge (z.B. PLZ=5). */
  maxLength?: number
  /** Web only — `pattern`-Attribut (z.B. PLZ-Regex). */
  pattern?: string
}
