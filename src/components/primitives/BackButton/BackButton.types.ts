// AAR-769 Phase 2 (Regel 4): Back-Pfeil. Rund, 40×40, Glass-Light, oben links.
// Wird in jedem Full-Screen-View + Modal benutzt.

export type BackButtonProps = {
  onPress: () => void
  /** a11y-Label; Default "Zurück" */
  label?: string
  /** Pixel-Offset von links und oben. Default 16. */
  offset?: number
  /** Position: 'fixed' (Viewport) oder 'absolute' (Parent). Default 'absolute'. */
  position?: 'fixed' | 'absolute'
}
