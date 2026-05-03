// AAR-769 Phase 2 / AAR-803: Drawer — slide-in von links/rechts, Full-Height,
// Glass-Light. Für Side-Nav auf Tablet/Desktop und Detail-Panels.
//
// AAR-803: Erweitert um noPadding, closeOnEsc und mobileFullscreen damit alle
// 5 handgerollten Side-Drawers (SupportDrawer, NeuLeadDrawer, DokumenteDrawer,
// FallakteDrawer, DrawerShell) auf den Primitive migrieren können.

import type { ReactNode } from 'react'

export type DrawerProps = {
  open: boolean
  onClose: () => void
  children?: ReactNode
  /** Slide-Seite. Default 'right'. */
  side?: 'left' | 'right'
  /** Breite in px ab md+. Default 420. */
  width?: number
  closeOnBackdrop?: boolean
  /** ESC schließt. Default true. */
  closeOnEsc?: boolean
  /** Wird ein Standard-CloseButton oben rechts gerendert? Default true. */
  hideCloseButton?: boolean
  /** Kein internes Padding — für Drawer mit eigenem Header/Body-Layout. */
  noPadding?: boolean
  /**
   * Auf Mobile (<md) volle Bildschirmbreite, ab md+ konstante `width`.
   * Default true.
   */
  mobileFullscreen?: boolean
  ariaLabel?: string
}
