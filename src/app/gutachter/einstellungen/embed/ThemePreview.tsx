'use client'

// AAR-939 · Stream 6 — WYSIWYG-Preview des Monika-Widgets.
// Spiegelt EXAKT die flache 4-Feld-Theme-Shape, die /api/embed/config (Stream 5)
// ausliefert (primary/accent/text/logoUrl/brandedByClaimondo) — damit der SV im
// Wizard sieht, was sein Widget tatsaechlich rendert. Die Farben sind dynamische
// User-Werte (kein Marken-Token) → inline-style ist hier korrekt.

import { resolvePreviewTheme, type EmbedSiteFormData } from '@/lib/embed/site-write'

export default function ThemePreview({
  form,
  svBrand,
  defaultLogo,
}: {
  form: EmbedSiteFormData
  svBrand: { brand_primary: string | null; brand_accent: string | null } | null
  defaultLogo: string
}) {
  const theme = resolvePreviewTheme(form, svBrand, defaultLogo)

  return (
    <div className="rounded-ios-xl border border-claimondo-border bg-claimondo-bg p-4">
      <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo mb-3">Vorschau</p>

      {/* Mock-Widget-Karte */}
      <div className="rounded-ios-lg bg-white shadow-sm overflow-hidden max-w-xs mx-auto">
        <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: theme.primary }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.logoUrl} alt="" className="h-5 w-auto object-contain" />
          <span className="text-sm font-semibold text-white">Schaden melden</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm" style={{ color: theme.text }}>
            Beschreibe kurz deinen Schaden — wir melden uns.
          </p>
          <div className="h-9 rounded-md border border-claimondo-border bg-claimondo-bg" />
          <button
            type="button"
            disabled
            className="w-full rounded-md py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: theme.accent }}
          >
            Anfrage senden
          </button>
          {theme.brandedByClaimondo && (
            <p className="text-[10px] text-center text-claimondo-ondo">powered by Claimondo</p>
          )}
        </div>
      </div>
    </div>
  )
}
