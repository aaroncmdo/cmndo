// Shared Tracking-Consent-Helpers (GA4/Ads/Clarity).
// Plain-Modul: von Server-Components (layout.tsx) UND Client-Components
// (CookieBanner, ClarityInit) importierbar. Bewusst KEIN 'use server'/'use
// client' — nur Konstanten + reine Funktionen (siehe AGENTS.md 'use server'-Falle).

/**
 * Cookie-Name aus react-cookie-consent (CookieBanner). Single-Source-of-Truth
 * fuer den Consent-State. Wert: 'true' (akzeptiert) | 'false' (abgelehnt).
 */
export const CONSENT_COOKIE_NAME = 'claimondo-cookie-consent'

/**
 * Window-Event, das der CookieBanner bei "Alle akzeptieren" feuert, damit
 * client-seitige Tracker (Clarity) live nachziehen ohne Reload.
 */
export const CONSENT_GRANTED_EVENT = 'claimondo:consent-granted'

/**
 * Marketing-Hauptdomain(s). Nur hier laedt der Google-Tag (GA4/Ads).
 * Portale + Funnel-Subdomains (app./gutachter./makler./kfzgutachter./schaden./
 * staging) bleiben tracking-frei, damit das GA4-Property nicht mit
 * Portal-Traffic verschmutzt wird.
 */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])

/**
 * Darf der Google-Tag auf diesem Host laden? Allow-list.
 * In Nicht-Production zaehlt localhost mit, damit der Consent-Flow lokal
 * smoke-bar ist (prod-Hosts greifen sonst nur live).
 */
export function isTrackingHost(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = host.split(':')[0].toLowerCase()
  if (TRACKING_HOSTS.has(hostname)) return true
  if (
    process.env.NODE_ENV !== 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return true
  }
  return false
}

/**
 * Client-seitig: hat der User Analytics/Marketing freigegeben?
 * Liest das react-cookie-consent-Cookie direkt aus document.cookie
 * (kein Lib-Import, robust gegen Package-Export-Pfade).
 */
export function hasTrackingConsent(): boolean {
  if (typeof document === 'undefined') return false
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'),
  )
  return match?.[1] === 'true'
}
