// AAR-769 Phase 2: Button-Primitive.
// Tone-basiert (kein className), 3 Größen, optional Icons links/rechts.

import type { ReactNode } from 'react'

export type ButtonTone = 'navy' | 'ondo' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  children?: ReactNode
  /** Tone-Variante (default 'navy') */
  tone?: ButtonTone
  /** Höhe: sm=36, md=44 (touchMin), lg=52 */
  size?: ButtonSize
  /** Icon links neben dem Label */
  iconLeft?: ReactNode
  /** Icon rechts neben dem Label */
  iconRight?: ReactNode
  /** Voll-breit innerhalb des Containers */
  fullWidth?: boolean
  disabled?: boolean
  onPress: () => void
  /** HTML-Form-Type (nur Web, RN ignoriert) */
  type?: 'button' | 'submit' | 'reset'
}
