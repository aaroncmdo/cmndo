// AAR-769 Phase 2: Badge-Primitive.
// Glass-Variante laut Design-Regel 3 für alle Count-Badges (Inbox-Counts,
// Notification-Dots etc.). Solid-Tone für Status-Pills im Listen-Kontext.

import type { ReactNode } from 'react'

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'navy'
  | 'ondo'

export type BadgeSize = 'sm' | 'md'

export type BadgeProps = {
  children?: ReactNode
  /** Tone (default 'neutral') */
  tone?: BadgeTone
  /** Glass-Style (Pflicht für Schwebe-Count-Badges) */
  glass?: boolean
  /** sm = 18px, md = 22px (default 'md') */
  size?: BadgeSize
}
