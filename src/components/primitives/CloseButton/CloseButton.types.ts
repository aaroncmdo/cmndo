// AAR-769 Phase 2 (Regel 5): X-Close. Rund, 40×40, Glass-Light, oben rechts.

export type CloseButtonProps = {
  onPress: () => void
  label?: string
  offset?: number
  position?: 'fixed' | 'absolute'
}
