// AAR-769 Phase 2: Card — Container-Primitive für Inhaltsblöcke.
// Solid white als Default. Glass-Variante NUR für Schwebe-Elemente
// (Modals, Popover, Drawer-Header). Accent-Border-Left für Severity-Cards.

import type {
  ColorName,
  RadiusName,
  ShadowName,
  SpacingStep,
} from '@/lib/design-tokens'
import type { ReactNode } from 'react'

export type CardProps = {
  children?: ReactNode
  /** Glass-Variante für Schwebe-Cards (Modals, Popover). Default: undefined = solid weiß. */
  glass?: 'light' | 'dark'
  /** Border-Left-Akzent (für Severity-Cards wie "critical"/"warning") */
  accentColor?: ColorName
  /** Padding (default 4 = 16px) */
  p?: SpacingStep
  /** Radius (default md = 14px) */
  radius?: RadiusName
  /** Shadow (default sm) */
  shadow?: ShadowName
  /** Border (default true wenn nicht glass) */
  bordered?: boolean
  /** Macht die Card klickbar — Web: <button>, Native: <Pressable> */
  onPress?: () => void
  /**
   * Web-only Escape-Hatch: zusätzliche Tailwind-Klassen (Layout/Hover/extra).
   * Native (`.native.tsx`) ignoriert das. Token-abgeleitete inline-styles
   * gewinnen bei Konflikten — nur nutzen wenn die Token-Props nicht reichen.
   */
  className?: string
}
