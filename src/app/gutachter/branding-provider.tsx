'use client'

import { createContext, useContext } from 'react'

type BrandingCtx = { primary: string; secondary: string; logoUrl: string | null; useCustom: boolean }

const BrandingContext = createContext<BrandingCtx>({
  primary: '#0D1B3E', secondary: '#4573A2', logoUrl: null, useCustom: false,
})

export function useBranding() { return useContext(BrandingContext) }

export function BrandingProvider({
  children, brandPrimary, brandSecondary, logoUrl, useCustom,
}: {
  children: React.ReactNode; brandPrimary: string | null; brandSecondary: string | null; logoUrl: string | null; useCustom: boolean
}) {
  const primary = useCustom && brandPrimary ? brandPrimary : '#0D1B3E'
  const secondary = useCustom && brandSecondary ? brandSecondary : '#4573A2'

  return (
    <BrandingContext.Provider value={{ primary, secondary, logoUrl: useCustom ? logoUrl : null, useCustom }}>
      <div style={{ '--brand-primary': primary, '--brand-secondary': secondary } as React.CSSProperties}>
        {children}
      </div>
    </BrandingContext.Provider>
  )
}
