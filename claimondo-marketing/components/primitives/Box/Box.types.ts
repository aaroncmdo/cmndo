// AAR-769 Phase 2: Box — generisches Container-Primitive.
// Wrapper um <div> (Web) / <View> (Native). Props primär semantisch (Token-
// Props). AAR-frontend-konsolidierung-p2 (P2-T0): optionaler `className`-
// Escape-Hatch (Web only) für Fälle die die Token-Props nicht abdecken.

import type { ColorName, RadiusName, ShadowName, SpacingStep } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type BoxProps = {
  children?: ReactNode
  /**
   * Web-only Escape-Hatch: zusätzliche Tailwind-Klassen (Layout/Hover/extra).
   * Native (`.native.tsx`) ignoriert das. Token-abgeleitete inline-styles
   * gewinnen bei Konflikten — nur nutzen wenn die Token-Props nicht reichen.
   */
  className?: string
  /** Padding in alle Richtungen. Ref: tokens.spacing */
  p?: SpacingStep
  /** Horizontal (left + right) */
  px?: SpacingStep
  /** Vertikal (top + bottom) */
  py?: SpacingStep
  /** Margin in alle Richtungen */
  m?: SpacingStep
  mx?: SpacingStep
  my?: SpacingStep
  /** Hintergrundfarbe aus Token-Palette */
  bg?: ColorName
  /** Border in colors.border wenn gesetzt */
  bordered?: boolean
  /** Radius aus Token-Skala */
  radius?: RadiusName
  /** Schatten aus Token-Skala */
  shadow?: ShadowName
  /** Maximale Breite in px (Web + Native) */
  maxWidth?: number
  /** Role für a11y (Web mapped auf role=, Native mapped auf accessibilityRole) */
  role?: 'region' | 'banner' | 'complementary' | 'main' | 'navigation' | 'none'
}
