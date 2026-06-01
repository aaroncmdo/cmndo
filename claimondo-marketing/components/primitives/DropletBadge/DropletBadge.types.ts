// AAR-769 Phase 2: Droplet-Badge (Regel 3: Count-Badges immer Droplet-Glass).
// Nicht zu verwechseln mit <Badge> (Label-Pill). DropletBadge ist die
// tropfenförmige Blase für Zähler, wie sie am Chat-Fab + Updates-Button
// hängt.

import type { ColorName } from '@/lib/design-tokens'

export type DropletBadgeProps = {
  /** Zahl. Bei 0: nichts rendern. Bei > 99 wird "99+" angezeigt. */
  count: number
  /** Farbton aus Token-Palette. Default: danger (für Unread-Counter). */
  tone?: ColorName
  /** Durchmesser in px. Default 18. */
  size?: number
}
