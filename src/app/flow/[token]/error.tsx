'use client'

import { useTranslations } from 'next-intl'

// AAR-271: window.location.reload() statt reset()
//
// i18n: useTranslations ist hier sicher. error.js umschliesst NUR page.js + nested
// children dieses Segments — NICHT das darueber liegende app/layout.tsx, das den
// Root-NextIntlClientProvider stellt (Next 16, error.md: "It does not wrap the
// layout.js above it in the same segment"). Der Provider ist also immer etabliert,
// wenn diese Boundary rendert. Caveat: die Locale stammt aus dem Root-Provider
// (Cookie claimondo-locale), nicht aus flow_links.sprache — denn der scoped Flow-
// Provider lebt INNERHALB von page.tsx und ist beim Render-Fehler ggf. nicht
// gemountet. Fuer einen anonymen Magic-Link-Besucher ist das i.d.R. 'de'; die
// token-Sprache ist hier (server-only DB-Wert) nicht verfuegbar. Kein Crash-Risiko.
export default function FlowError({ error: _error }: { error: Error }) {
  const t = useTranslations('flow')
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-ios-lg p-8 text-center shadow-claimondo-lg shadow-black/10">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-claimondo-navy mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          {t('error.heading')}
        </h1>
        <p className="text-sm text-claimondo-ondo mb-6">
          {t('error.body')}
        </p>
        <button onClick={() => window.location.reload()}
          className="px-6 py-3 bg-claimondo-ondo text-white font-medium text-sm rounded-ios-md hover:bg-claimondo-shield transition-colors">
          {t('error.reload')}
        </button>
      </div>
    </div>
  )
}
