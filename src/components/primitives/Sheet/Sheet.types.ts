// AAR-769 Phase 2: Bottom-Sheet — von unten slide-in, Glass-Light,
// Drag-Handle oben, closeOnBackdrop. Mobile Primitiv für Action-Sheets
// und Formulare auf kleinen Viewports.

import type { ReactNode } from 'react'

export type SheetProps = {
  open: boolean
  onClose: () => void
  children?: ReactNode
  /** Max-Höhe als Anteil der Viewport-Höhe (0..1). Default 0.85. */
  maxHeightRatio?: number
  closeOnBackdrop?: boolean
  ariaLabel?: string
}
