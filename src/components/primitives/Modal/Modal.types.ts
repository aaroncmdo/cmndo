// AAR-769 Phase 2 (Regel 1+2): Modal — zentriert, Glass-Light, mit
// Backdrop-Blur. Trigger bleibt KEIN explizites Prop — das Aufrufer-
// Component rendert seinen Trigger selbst und kontrolliert `open`.

import type { ReactNode } from 'react'

export type ModalProps = {
  open: boolean
  onClose: () => void
  children?: ReactNode
  /** Max-Breite in px. Default 480. */
  maxWidth?: number
  /** Dismiss-Verhalten */
  closeOnBackdrop?: boolean // default true
  closeOnEsc?: boolean // default true
  /** Versteckt den Standard-CloseButton oben rechts. Aufrufer kann
   *  eigenen rendern wenn er das Layout anders will. */
  hideCloseButton?: boolean
  /** a11y-Label für den Dialog */
  ariaLabel?: string
}
