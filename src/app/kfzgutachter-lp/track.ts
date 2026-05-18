// Tracking-Helper für die kfzgutachter-Ads-LP. Fügt lp_variant + source
// automatisch als Default-Params zu jedem gtag-Event hinzu. Caller können
// die Defaults explizit überschreiben.

const LP_VARIANT = 'test_b'
const SOURCE = 'kfzgutachter-ads-lp'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void

export function trackLpEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  if (!w.gtag) return
  w.gtag('event', eventName, {
    lp_variant: LP_VARIANT,
    source: SOURCE,
    ...(params ?? {}),
  })
}
