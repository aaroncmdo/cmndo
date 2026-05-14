// AAR-769 Phase 2: Web-Implementierung von <Icon>.
// Rendert die übergebene Lucide-Component mit Token-Farbe + size-prop.
//
// Server-Component (kein 'use client'): Lucide-Icons sind Funktionen und
// können als Prop nur server-seitig durchgereicht werden. Wäre dieser Wrapper
// ein Client-Component, würde `<Icon icon={FolderOpenIcon} />` aus einer
// Server-Page crashen ("Functions cannot be passed directly to Client
// Components"). AAR-Crash 14.05.2026 (/kunde/faelle) hat das Pattern hier
// bewusst zurück auf Server-only gesetzt. Keine Hooks, kein Event-Handler —
// reine Render-Fn, daher kein 'use client' nötig.

import { tokens } from '@/lib/design-tokens'
import type { IconProps } from './Icon.types'

export function Icon({ icon: IconComp, size = 16, color = 'navy' }: IconProps) {
  return <IconComp size={size} color={tokens.colors[color]} />
}
