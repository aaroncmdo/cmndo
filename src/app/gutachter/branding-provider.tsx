'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { BrandTheme, BrandThemeV2 } from '@/lib/branding/theme'
import { CLAIMONDO_DEFAULT_THEME, themeFromLegacy } from '@/lib/branding/theme'
import { generateCssVars, type BrandingMode } from '@/lib/branding/css-vars'

// AAR-220 (V1) + AAR-424 (V2): BrandingProvider mit 3 Modi.
//
// V1-API (legacy — bleibt funktional):
//   <BrandingProvider brandPrimary="#..." brandSecondary="#..." logoUrl={...} useCustom={...}>
// V2-API (neu, mode-aware):
//   <BrandingProvider mode="full" theme={themeV2} logoUrl={...}>
//
// Wenn die neue `mode`+`theme`-Variante genutzt wird, setzt der Provider die
// 25 CSS-Vars (full) oder 4 Primary-Vars (light). V1-Calls werden intern auf
// mode=full + themeFromLegacy(primary, secondary) gemappt — volle Kompatibilität
// mit dem bisherigen `--brand-primary`/`--brand-secondary`-Verhalten.

type BrandingCtx = {
  primary: string
  secondary: string
  logoUrl: string | null
  useCustom: boolean
  mode: BrandingMode
  theme: BrandThemeV2
}

const BrandingContext = createContext<BrandingCtx>({
  primary: CLAIMONDO_DEFAULT_THEME.primary,
  secondary: CLAIMONDO_DEFAULT_THEME.secondary,
  logoUrl: null,
  useCustom: false,
  mode: 'none',
  theme: CLAIMONDO_DEFAULT_THEME,
})

export function useBranding() {
  return useContext(BrandingContext)
}

type Props = {
  children: ReactNode
  logoUrl?: string | null
  useCustom?: boolean
  // V2-API
  mode?: BrandingMode
  theme?: BrandTheme | BrandThemeV2 | null
  // V1-API (legacy — ein Consumer konvertiert hier intern zu theme via themeFromLegacy)
  brandPrimary?: string | null
  brandSecondary?: string | null
}

export function BrandingProvider({
  children,
  logoUrl = null,
  useCustom = false,
  mode,
  theme,
  brandPrimary = null,
  brandSecondary = null,
}: Props) {
  // Effektiven Mode ableiten:
  // - V2-Caller hat `mode` explizit gesetzt → diesen nehmen
  // - V1-Caller hat useCustom=true + brandPrimary gesetzt → mode=full
  // - sonst → none (Claimondo-Default)
  const effectiveMode: BrandingMode = mode
    ?? (useCustom && brandPrimary ? 'full' : 'none')

  // Theme auf V2 hydrieren:
  // - V2-Caller hat `theme` übergeben → den nehmen (mit Default-Fill falls teils V1)
  // - V1-Caller hat brandPrimary gesetzt → themeFromLegacy()
  // - sonst → Claimondo-Default
  const effectiveTheme: BrandThemeV2 = useMemo(() => {
    if (theme) {
      // V2-Shape oder Partial — via Spread auf Default fallbacken
      return { ...CLAIMONDO_DEFAULT_THEME, ...theme } as BrandThemeV2
    }
    if (brandPrimary) {
      return themeFromLegacy(brandPrimary, brandSecondary)
    }
    return CLAIMONDO_DEFAULT_THEME
  }, [theme, brandPrimary, brandSecondary])

  const cssVars = useMemo(
    () => generateCssVars(effectiveTheme, effectiveMode),
    [effectiveTheme, effectiveMode],
  )

  const ctxValue: BrandingCtx = {
    primary: effectiveTheme.primary,
    secondary: effectiveTheme.secondary,
    logoUrl: effectiveMode === 'none' ? null : logoUrl,
    useCustom: effectiveMode !== 'none',
    mode: effectiveMode,
    theme: effectiveTheme,
  }

  // Bei mode=none keinen Wrapper-Div um ungewollte Layout-Effekte zu vermeiden.
  if (effectiveMode === 'none') {
    return <BrandingContext.Provider value={ctxValue}>{children}</BrandingContext.Provider>
  }

  return (
    <BrandingContext.Provider value={ctxValue}>
      <div style={cssVars}>{children}</div>
    </BrandingContext.Provider>
  )
}
