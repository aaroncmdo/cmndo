// AAR-769 Phase 2: Button-Primitive.
// Tone-basiert, 4 Größen (inkl. quadratisch 'icon'), optional Icons links/rechts.
// AAR-frontend-konsolidierung-p2 (P2-T0): `className`-Escape-Hatch (Web only),
// `onPress` optional (für reine type="submit"-Buttons), Größe 'icon' (quadratisch).

import type { ReactNode } from 'react'

export type ButtonTone = 'navy' | 'ondo' | 'ghost' | 'danger' | 'success'
/** sm=36 · md=44 (touchMin) · lg=52 · icon=44×44 quadratisch (Icon-only) */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export type ButtonProps = {
  children?: ReactNode
  /** Tone-Variante (default 'navy') */
  tone?: ButtonTone
  /** Höhe (default 'md'). 'icon' = 44×44 quadratisch ohne horizontales Padding. */
  size?: ButtonSize
  /** Icon links neben dem Label */
  iconLeft?: ReactNode
  /** Icon rechts neben dem Label */
  iconRight?: ReactNode
  /** Voll-breit innerhalb des Containers */
  fullWidth?: boolean
  disabled?: boolean
  /**
   * Klick-Handler. Optional — bei einem reinen `type="submit"`-Button in einem
   * `<form>` darf er fehlen (das Formular übernimmt den Submit).
   */
  onPress?: () => void
  /** HTML-Form-Type (nur Web, RN ignoriert) */
  type?: 'button' | 'submit' | 'reset'
  /**
   * Web-only Escape-Hatch: zusätzliche Tailwind-Klassen (Layout/extra). Native
   * (`.native.tsx`) ignoriert das. Token-abgeleitete inline-styles gewinnen bei
   * Konflikten — nur nutzen wenn die Tone-/Size-Props nicht reichen.
   */
  className?: string
}
