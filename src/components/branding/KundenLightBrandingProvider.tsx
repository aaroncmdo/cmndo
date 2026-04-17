'use client'

import type { ReactNode } from 'react'
import type { BrandTheme } from '@/lib/branding/theme'

// AAR-423: Light-Branding für Kunden-Seiten. Setzt NUR 4 Primary-Varianten
// als CSS-Vars — Background/Surface/Text/Border/Fonts bleiben Claimondo-Default.
// Retention-kritisch: Kunde darf die Seite nicht als SV-Portal wahrnehmen.
//
// Getrennte Komponente vom Gutachter-BrandingProvider damit der AAR-424-
// Full-Refactor nicht durch die Kunden-Seiten-Anforderungen blockiert wird.

type Props = {
  enabled: boolean
  theme: Pick<BrandTheme, 'primary' | 'primaryHover' | 'primaryActive' | 'primarySoft'> | null
  children: ReactNode
}

export default function KundenLightBrandingProvider({ enabled, theme, children }: Props) {
  if (!enabled || !theme?.primary) {
    return <>{children}</>
  }

  // Nur 4 Vars — Background, Surface, Text, Border, Fonts bleiben Claimondo.
  const style = {
    '--brand-primary': theme.primary,
    '--brand-primary-hover': theme.primaryHover ?? theme.primary,
    '--brand-primary-active': theme.primaryActive ?? theme.primary,
    '--brand-primary-soft': theme.primarySoft ?? theme.primary,
  } as React.CSSProperties

  return <div style={style}>{children}</div>
}
