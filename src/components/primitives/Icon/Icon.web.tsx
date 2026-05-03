'use client'

// AAR-769 Phase 2: Web-Implementierung von <Icon>.
// Rendert die übergebene Lucide-Component mit Token-Farbe + size-prop.

import { tokens } from '@/lib/design-tokens'
import type { IconProps } from './Icon.types'

export function Icon({ icon: IconComp, size = 16, color = 'navy' }: IconProps) {
  return <IconComp size={size} color={tokens.colors[color]} />
}
