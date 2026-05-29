import type { BrandTheme, BrandThemeV2 } from './theme'
import { CLAIMONDO_DEFAULT_THEME } from './theme'

// AAR-424: CSS-Var-Generator für den BrandingProvider.
//
// Drei Modi:
// - full  → 30 CSS-Vars (alle V2-Tokens: 9 Core + 5 Neutrale + 5 Text +
//           4 Sidebar + 7 Status). Für SV-Portal (GutachterShell) wo die
//           komplette App gebrandet wird.
// - light → 4 Primary-Vars (primary + Hover/Active/Soft). Für Kunden-Seiten
//           wo Claimondo dominant bleibt und nur CTAs/Akzente brandet werden.
// - none  → leeres Object. Claimondo-Default via Tailwind.
//
// V1-Alias-Namen (`--brand-sidebar-bg`, `--brand-text-on-primary`, `--brand-surface`)
// werden bei `full` zusätzlich gesetzt damit existierende Consumer
// (GutachterShell, BrandedLayout) ohne Änderung weiterlaufen.

export type BrandingMode = 'full' | 'light' | 'none'

export function generateCssVars(
  theme: BrandTheme | BrandThemeV2 | null | undefined,
  mode: BrandingMode,
): React.CSSProperties {
  if (mode === 'none') return {}

  // Theme auf V2-Shape normalisieren (fehlende Keys aus Default).
  const t = { ...CLAIMONDO_DEFAULT_THEME, ...(theme ?? {}) } as BrandThemeV2

  if (mode === 'light') {
    // Nur Primary-Varianten — Kunden-Seiten. Background/Text/Surface bleiben
    // Claimondo-Default via Tailwind.
    return {
      '--brand-primary': t.primary,
      '--brand-primary-hover': t.primaryHover,
      '--brand-primary-active': t.primaryActive,
      '--brand-primary-soft': t.primarySoft,
    } as React.CSSProperties
  }

  // mode === 'full' — 30 V2-Tokens (die V1-Alias-Namen --brand-sidebar-bg /
  // -text-on-primary / -surface sind hier zugleich V2-Keys, backwards-compat)
  return {
    // V2 Core
    '--brand-primary': t.primary,
    '--brand-primary-hover': t.primaryHover,
    '--brand-primary-active': t.primaryActive,
    '--brand-primary-soft': t.primarySoft,
    '--brand-secondary': t.secondary,
    '--brand-secondary-hover': t.secondaryHover,
    '--brand-secondary-active': t.secondaryActive,
    '--brand-secondary-soft': t.secondarySoft,
    '--brand-accent': t.accent,

    // V2 Neutrale
    '--brand-background': t.background,
    '--brand-surface': t.surface,
    '--brand-surface-muted': t.surfaceMuted,
    '--brand-border': t.border,
    '--brand-border-strong': t.borderStrong,

    // V2 Text
    '--brand-text-primary': t.textPrimary,
    '--brand-text-secondary': t.textSecondary,
    '--brand-text-muted': t.textMuted,
    '--brand-text-on-primary': t.textOnPrimary,
    '--brand-text-on-accent': t.textOnAccent,

    // V2 Sidebar
    '--brand-sidebar-bg': t.sidebarBg,
    '--brand-sidebar-text': t.sidebarText,
    '--brand-sidebar-active': t.sidebarActive,
    '--brand-sidebar-hover': t.sidebarHover,

    // V2 Status (mit Soft-Varianten für Background-Pillen)
    '--brand-success': t.success,
    '--brand-success-soft': t.successSoft,
    '--brand-warning': t.warning,
    '--brand-warning-soft': t.warningSoft,
    '--brand-danger': t.danger,
    '--brand-danger-soft': t.dangerSoft,
    '--brand-info': t.info,
  } as React.CSSProperties
}

// Utility für Tests / Debug: wie viele Vars setzt der Mode?
export function countCssVars(mode: BrandingMode): number {
  return Object.keys(generateCssVars(CLAIMONDO_DEFAULT_THEME, mode)).length
}
