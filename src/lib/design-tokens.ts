// AAR-769 Phase 1: Design-System — Single Source of Truth.
//
// Dieses File ist BEWUSST frei von Framework-Spezifika (kein Tailwind, kein
// CSS-Modul, kein React). Es wird von:
//   - Web-Components (src/components/primitives/*.web.tsx) via Inline-Styles +
//     Tailwind-Config-Referenz importiert
//   - Native-Components (src/components/primitives/*.native.tsx) via
//     StyleSheet.create() importiert
//   - globals.css via Mapping auf CSS-Variablen
//
// Änderungen hier ändern das ganze System. Keine Einzel-Ausnahmen in
// Consumer-Files — wenn ein Wert fehlt, hier ergänzen.
//
// Session 2026-04-24: Aaron hat die Werte in Design-Sync fixiert.

export const colors = {
  navy: '#0D1B3E',
  ondo: '#4573A2',
  shield: '#1E3A5F',
  lightBlue: '#7BA3CC',
  border: '#e4e7ef',
  bg: '#f8f9fb',
  white: '#ffffff',
  // Semantische Farben (bleiben, tragen Bedeutung)
  success: '#10B981', // emerald-500
  warning: '#F59E0B', // amber-500
  danger: '#F43F5E', // rose-500
  info: '#4573A2', // == ondo
} as const

/**
 * Radien-Skala — 3 Stufen + full.
 * sm = Buttons, Badges, Inputs
 * md = Cards, Modal-Content
 * lg = Modal-Container, FAB, Drawer-Sheet
 * full = Avatare, Pillen, kreisförmige Bubbles
 */
export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  full: 9999,
} as const

/**
 * Schatten-Skala — 3 Stufen mit Navy-Tint.
 * sm = Dezente Cards
 * md = Popover, Chat-Bubble, Floating-Aside
 * lg = Modals, Fullscreen-FAB
 */
export const shadow = {
  sm: '0 1px 2px rgba(13, 27, 62, 0.04), 0 1px 3px rgba(13, 27, 62, 0.06)',
  md: '0 4px 6px -1px rgba(13, 27, 62, 0.06), 0 2px 4px -2px rgba(13, 27, 62, 0.04)',
  lg: '0 10px 25px -5px rgba(13, 27, 62, 0.1), 0 8px 10px -6px rgba(13, 27, 62, 0.06)',
} as const

/**
 * Native-Schatten-Config (für StyleSheet.create). iOS nutzt shadow*,
 * Android nutzt elevation.
 */
export const shadowNative = {
  sm: {
    shadowColor: '#0D1B3E',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0D1B3E',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#0D1B3E',
    shadowOpacity: 0.12,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const

/**
 * Spacing-Skala — 4-er-Basis. Gleiche Werte für padding/margin/gap.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

/**
 * Typografie — 7 verbindliche Stufen. Line-Height als absolute Zahl,
 * kompatibel mit RN (kein em/unitless).
 */
export const typo = {
  caption: {
    size: 10,
    weight: '600' as const,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  bodyXs: { size: 11, weight: '400' as const, lineHeight: 16 },
  bodySm: { size: 13, weight: '400' as const, lineHeight: 20 },
  body: { size: 14, weight: '400' as const, lineHeight: 22 },
  headingSm: { size: 16, weight: '600' as const, lineHeight: 22 },
  headingMd: { size: 18, weight: '600' as const, lineHeight: 26 },
  headingLg: { size: 24, weight: '700' as const, lineHeight: 32 },
} as const

/**
 * Glass-Oberflächen. Nur für Schwebe-Elemente: Modals, Popover, Drawer,
 * Sheet, FAB, Chat-Bubble, Badges. KEINE Content-Cards.
 *
 * dark.blur = 0 weil AAR-758 die Navbar global opak haben will.
 */
export const glass = {
  light: {
    bg: 'rgba(255, 255, 255, 0.72)',
    border: 'rgba(255, 255, 255, 0.4)',
    blur: 20,
  },
  dark: {
    bg: '#0D1B3E',
    border: 'rgba(255, 255, 255, 0.12)',
    blur: 0,
  },
} as const

/**
 * Breakpoints für Shell-Varianten.
 * Mobile < 768, Tablet 768-1200, Desktop >= 1200.
 */
export const breakpoints = {
  mobile: 768,
  tablet: 1200,
} as const

/**
 * Touch-Target-Minimum laut iOS-HIG + Material. Alle interaktiven Elemente
 * mindestens 44×44. Nur Icon-only-Buttons dürfen kleiner sein wenn sie
 * Teil einer größeren Touch-Region sind.
 */
export const touchMin = 44

/**
 * Exportierter Aggregat-Type für einfachen Import in Consumer.
 */
export const tokens = {
  colors,
  radius,
  shadow,
  shadowNative,
  spacing,
  typo,
  glass,
  breakpoints,
  touchMin,
} as const

export type Tokens = typeof tokens
export type ColorName = keyof typeof colors
export type RadiusName = keyof typeof radius
export type ShadowName = keyof typeof shadow
export type SpacingStep = keyof typeof spacing
export type TypoVariant = keyof typeof typo
