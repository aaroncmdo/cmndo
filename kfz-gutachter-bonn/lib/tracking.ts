// Tracking-Layer · dataLayer + Beacon + Google-Ads-Conversion-Hooks.
// Server-Side-resilient via navigator.sendBeacon. Wird ausschliesslich
// clientseitig (SiteScripts useEffect) aufgerufen — window/document/localStorage
// defensiv geguarded. Stubs feuern auch ohne befuellte ENV (nur dataLayer +
// /api/track), echte Google-Ads-Conversion erst wenn AW-ID gesetzt.
import { SITE } from './site'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void
  }
}

export type TrackParams = Record<string, string | number | boolean | undefined>

const ATTRIBUTION_KEYS = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 Tage

/** dataLayer-Push + gtag + Plausible + Beacon an /api/track. */
export function trackEvent(name: string, params: TrackParams = {}): void {
  if (typeof window === 'undefined') return
  const payload = { event: name, ts: Date.now(), ...params }
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
  if (typeof window.gtag === 'function') window.gtag('event', name, params)
  if (typeof window.plausible === 'function') {
    const props: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(params)) if (v !== undefined) props[k] = v
    window.plausible(name, Object.keys(props).length ? { props } : undefined)
  }
  // Server-Side-resilient: Beacon ueberlebt Tab-Wechsel (keepalive).
  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
    } else {
      void fetch('/api/track', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } })
    }
  } catch {
    /* Tracking darf nie den UX-Flow brechen. */
  }
}

/** gclid/utm aus URL → localStorage (90 Tage). Monika-Embed liest sie spaeter. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const now = Date.now()
    for (const key of ATTRIBUTION_KEYS) {
      const val = url.searchParams.get(key)
      if (val) localStorage.setItem(`_cl_${key}`, JSON.stringify({ v: val, t: now }))
    }
  } catch {
    /* private mode / disabled storage — ignorieren */
  }
}

/** Gespeicherte Attribution (fuer Conversion-Properties + spaeteres Embed). */
export function readAttribution(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof window === 'undefined') return out
  try {
    const now = Date.now()
    for (const key of ATTRIBUTION_KEYS) {
      const raw = localStorage.getItem(`_cl_${key}`)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { v: string; t: number }
      if (now - parsed.t < ATTR_TTL_MS) out[key] = parsed.v
    }
  } catch {
    /* ignore */
  }
  return out
}

/** Google-Ads-Conversion (nur wenn AW-ID + Label gesetzt). value/currency fix. */
export function fireAdsConversion(kind: 'call' | 'wa'): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  if (!SITE.gadsAwId) return
  const label = kind === 'call' ? SITE.gadsConvCall : SITE.gadsConvWa
  if (!label) return
  window.gtag('event', 'conversion', {
    send_to: `${SITE.gadsAwId}/${label}`,
    value: kind === 'call' ? 30.0 : 15.0,
    currency: 'EUR',
  })
}
