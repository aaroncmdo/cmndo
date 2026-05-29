import type { ColorName, TypoVariant } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type TextProps = {
  children?: ReactNode
  /** Typo-Skala aus design-tokens.typo */
  variant?: TypoVariant
  /** Farbe aus Token-Palette. Default: navy */
  color?: ColorName
  /** Textausrichtung */
  align?: 'left' | 'center' | 'right'
  /** Semantischer HTML-Tag (Web). Wird ignoriert auf Native. */
  as?: 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'div' | 'label'
  /** Truncate mit ellipsis bei Überlauf */
  truncate?: boolean
  /** Max Zeilen (line-clamp) */
  numberOfLines?: number
}
