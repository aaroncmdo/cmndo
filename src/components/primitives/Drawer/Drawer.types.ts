// AAR-769 Phase 2: Drawer — slide-in von links/rechts, Full-Height,
// Glass-Light. Für Side-Nav auf Tablet/Desktop und Detail-Panels.

import type { ReactNode } from 'react'

export type DrawerProps = {
  open: boolean
  onClose: () => void
  children?: ReactNode
  /** Slide-Seite. Default 'right'. */
  side?: 'left' | 'right'
  /** Breite in px. Default 360. */
  width?: number
  closeOnBackdrop?: boolean
  /** Wird ein Standard-CloseButton oben rechts gerendert? Default true. */
  hideCloseButton?: boolean
  ariaLabel?: string
}
