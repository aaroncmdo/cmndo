// Tracking-Helper für die kfzgutachter-Ads-LP. Fügt lp_variant + source
// automatisch als Default-Params zu jedem gtag-Event hinzu. Caller können
// die Defaults explizit überschreiben.
//
// Ambient-Typ für window.gtag: src/types/gtag.d.ts

export const LP_VARIANT = 'test_b'
export const SOURCE = 'kfzgutachter-ads-lp'

export function trackLpEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!window.gtag) return
  window.gtag('event', eventName, {
    lp_variant: LP_VARIANT,
    source: SOURCE,
    ...params,
  })
}
