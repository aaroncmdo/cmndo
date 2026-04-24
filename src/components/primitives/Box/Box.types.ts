// AAR-769 Phase 2: Box — generisches Container-Primitive.
// Wrapper um <div> (Web) / <View> (Native). Props nur semantisch — keine
// className-Durchreiche.

import type { ColorName, RadiusName, ShadowName, SpacingStep } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type BoxProps = {
  children?: ReactNode
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
