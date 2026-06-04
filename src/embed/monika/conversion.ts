// AAR-939 · Monika-Embed — Per-SV Conversion-Feuern (client-side gtag).
//
// planConversionCalls: PURE — entscheidet aus den Tracking-IDs die gtag-Calls
// (testbar). fireSiteConversion: laedt gtag.js lazy (post-consent, nur bei
// Submit-Erfolg) und wendet die Calls an. KEIN value → der SV definiert den Wert
// in seiner GA4-/Ads-Conversion-Action selbst (wir ueberschreiben ihn nicht).

import type { MonikaConfig, MonikaTracking } from './types'

export type GtagCall = [string, ...unknown[]]

export function planConversionCalls(t: MonikaTracking): GtagCall[] {
  const calls: GtagCall[] = []
  if (t.ga4MeasurementId) {
    calls.push(['config', t.ga4MeasurementId])
    calls.push(['event', 'generate_lead', { send_to: t.ga4MeasurementId }])
  }
  if (t.gadsConversionId) {
    calls.push(['config', t.gadsConversionId])
    const sendTo = t.gadsConversionLabel ? `${t.gadsConversionId}/${t.gadsConversionLabel}` : t.gadsConversionId
    calls.push(['event', 'conversion', { send_to: sendTo }])
  }
  return calls
}

interface GtagWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

/** Stellt sicher, dass window.gtag existiert; laedt gtag.js einmalig mit loadId. */
function ensureGtag(loadId: string): (...args: unknown[]) => void {
  const w = window as GtagWindow
  if (typeof w.gtag === 'function') return w.gtag // SV hat schon gtag → wiederverwenden
  w.dataLayer = w.dataLayer || []
  const gtag = (...args: unknown[]) => {
    ;(w.dataLayer as unknown[]).push(args)
  }
  w.gtag = gtag
  gtag('js', new Date())
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loadId)}`
  document.head.appendChild(s)
  return gtag
}

/** Feuert bei Submit-Erfolg die per-SV-Conversion. No-op ohne IDs / ausser sv_embed. */
export function fireSiteConversion(cfg: MonikaConfig): void {
  if (cfg.source !== 'sv_embed' || !cfg.tracking) return
  const calls = planConversionCalls(cfg.tracking)
  if (calls.length === 0) return
  const loadId = cfg.tracking.ga4MeasurementId || cfg.tracking.gadsConversionId
  if (!loadId) return
  try {
    const gtag = ensureGtag(loadId)
    for (const [cmd, ...args] of calls) gtag(cmd, ...args)
  } catch {
    /* Tracking darf den Erfolgs-Flow nie brechen */
  }
}
