// AAR-769 Phase 2: Icon-Primitive — Wrapper um Lucide (Web).
// Native-Mapping kommt mit Expo-App (Follow-up-Ticket).

import type { ColorName } from '@/lib/design-tokens'
import type { LucideIcon } from 'lucide-react'

export type IconProps = {
  /** Lucide-Icon-Component (Web). Native nutzt einen Stub bis Expo da ist. */
  icon: LucideIcon
  /** Pixel-Größe (default 16) */
  size?: number
  /** Farbe aus Token-Palette (default 'navy') */
  color?: ColorName
}
