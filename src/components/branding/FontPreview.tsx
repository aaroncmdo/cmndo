'use client'

import { useEffect, useState } from 'react'
import { buildGoogleFontsUrl, type FontPair } from '@/lib/branding/fonts'
import type { BrandTheme } from '@/lib/branding/theme'

// AAR-421: Live-Preview für Font-Paar + Theme-Kombination.
// Lädt den Google-Fonts-Stylesheet dynamisch via <link>-Injection — nur für
// die Admin-/Branding-Konfig-Seite. Der produktive Portal-Render nutzt
// später den BrandingProvider (AAR-424) mit next/font.
//
// `font-display: swap` ist in der gebauten CSS2-URL gesetzt → kein FOIT.

type Props = {
  theme: Pick<BrandTheme, 'primary' | 'secondary' | 'surface' | 'textOnPrimary'>
  fontPair: FontPair
  className?: string
}

// Single-Cache auf Module-Level damit wir denselben Stylesheet beim Wechsel
// zwischen FontPreview-Instanzen nicht mehrfach injizieren.
const loadedHrefs = new Set<string>()

function ensureStylesheet(href: string): void {
  if (typeof document === 'undefined') return
  if (loadedHrefs.has(href)) return
  const existing = document.querySelector(`link[data-font-preview="${href}"]`)
  if (existing) {
    loadedHrefs.add(href)
    return
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.fontPreview = href
  document.head.appendChild(link)
  loadedHrefs.add(href)
}

export default function FontPreview({ theme, fontPair, className }: Props) {
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    const url = buildGoogleFontsUrl(fontPair)
    ensureStylesheet(url)
    setHref(url)
  }, [fontPair])

  const primary = theme.primary ?? '#0D1B3E'
  const secondary = theme.secondary ?? '#4573A2'
  const surface = theme.surface ?? '#FFFFFF'
  const textOnPrimary = theme.textOnPrimary ?? '#FFFFFF'

  return (
    <div
      className={`rounded-2xl border border-gray-200 overflow-hidden ${className ?? ''}`}
      style={{ background: surface }}
      data-loaded={href != null}
    >
      <div className="px-5 py-4 space-y-3" style={{ color: '#0D1B3E' }}>
        <h3 style={{ fontFamily: fontPair.cssStack.heading, fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}>
          Claimondo Portal
        </h3>
        <p style={{ fontFamily: fontPair.cssStack.body, fontSize: 14, color: '#4A5568' }}>
          Willkommen zurück, Max. {fontPair.preview}
        </p>

        <div className="pt-2 space-y-1">
          <p style={{ fontFamily: fontPair.cssStack.heading, fontWeight: 600, fontSize: 13, color: '#0D1B3E' }}>
            Nächste Termine
          </p>
          <ul style={{ fontFamily: fontPair.cssStack.body, fontSize: 13, color: '#4A5568' }} className="space-y-0.5">
            <li>Schaden 1234 — 14:00</li>
            <li>Schaden 1287 — 16:30</li>
          </ul>
        </div>

        <div className="flex gap-2 pt-3">
          <button
            type="button"
            style={{
              fontFamily: fontPair.cssStack.body,
              background: primary,
              color: textOnPrimary,
              fontSize: 13,
              fontWeight: 600,
            }}
            className="px-3.5 py-1.5 rounded-lg"
          >
            Bestätigen
          </button>
          <button
            type="button"
            style={{
              fontFamily: fontPair.cssStack.body,
              background: 'transparent',
              color: secondary,
              border: `1px solid ${secondary}`,
              fontSize: 13,
              fontWeight: 500,
            }}
            className="px-3.5 py-1.5 rounded-lg"
          >
            Ablehnen
          </button>
        </div>
      </div>
    </div>
  )
}
