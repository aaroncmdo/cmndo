import type { ColorName, RadiusName, SpacingStep } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type RowProps = {
  children?: ReactNode
  gap?: SpacingStep
  p?: SpacingStep
  px?: SpacingStep
  py?: SpacingStep
  bg?: ColorName
  radius?: RadiusName
  /** Vertikale Ausrichtung der Kinder (align-items) */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  /** Horizontale Verteilung (justify-content) */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  /** Umbruch bei Platzmangel */
  wrap?: boolean
}
