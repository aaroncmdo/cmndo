import type { ColorName, RadiusName, SpacingStep } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type StackProps = {
  children?: ReactNode
  /** Abstand zwischen Kindern */
  gap?: SpacingStep
  /** Padding */
  p?: SpacingStep
  px?: SpacingStep
  py?: SpacingStep
  bg?: ColorName
  radius?: RadiusName
  /** Horizontale Ausrichtung der Kinder (align-items in column) */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** Vertikale Ausrichtung (justify-content) */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
}
