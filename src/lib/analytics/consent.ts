// Shared Tracking-Consent + Host-Gating-Helpers.
// Seit der Cookiebot-Migration (CMP + Google Consent Mode v2) managed Cookiebot
// den Consent. Diese Helfer lesen NUR den Cookiebot-Consent (Client via
// window.Cookiebot bzw. Cookie 'CookieConsent'). Plain-Modul: von Server- UND
// Client-Components importierbar (kein 'use server'/'use client').

/** Cookiebot Domain-Group-ID (CBID). */
export const COOKIEBOT_CBID = '496ea8a7-514a-4da7-937c-69770e76388c'

/** Cookiebot-Consent-Cookie (von der CMP gesetzt, URL-encoded). */
export const COOKIEBOT_COOKIE_NAME = 'CookieConsent'

/** Cookiebot-Event nach Consent-Auswahl (Client live-Update ohne Reload). */
export const COOKIEBOT_CONSENT_EVENT = 'CookiebotOnConsentReady'

/** GA4/Ads-Hauptdomain — nur hier laedt der Google-Tag (GA4 G-CFMJHZM2NR). */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])

/**
 * Public-Marketing-Hosts, auf denen die Cookiebot-CMP laeuft. Breiter als
 * TRACKING_HOSTS (LP inklusive), aber bewusst NICHT die authenticated Portale
 * (app./gutachter./makler./mitarbeiter.) — dort wuerde Cookiebot-Auto-Blocking
 * legitime Portal-Skripte (Supabase/Mapbox) blocken + einen doppelten
 * Consent-Dialog zeigen.
 */
const COOKIEBOT_HOSTS = new Set([
  'claimondo.de',
  'www.claimondo.de',
  'kfzgutachter.claimondo.de',
])

function matchHost(host: string | null | undefined, set: Set<string>): boolean {
  if (!host) return false
  const hostname = host.split(':')[0].toLowerCase()
  if (set.has(hostname)) return true
  // Lokales Testen: in Dev zaehlt localhost mit.
  if (
    process.env.NODE_ENV !== 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return true
  }
  return false
}

/** Darf der Google-Tag (GA4/Ads) auf diesem Host laden? */
export function isTrackingHost(host: string | null | undefined): boolean {
  return matchHost(host, TRACKING_HOSTS)
}

/** Laeuft die Cookiebot-CMP auf diesem Host? (Public-Marketing inkl. LP) */
export function isCookiebotHost(host: string | null | undefined): boolean {
  return matchHost(host, COOKIEBOT_HOSTS)
}

/**
 * Server-seitig: parse den Cookiebot-'CookieConsent'-Cookie-Wert in die
 * Consent-Kategorien (URL-encoded, z.B. ...statistics:true,marketing:false...).
 */
export function parseCookiebotConsent(
  cookieValue: string | null | undefined,
): { statistics: boolean; marketing: boolean } {
  if (!cookieValue) return { statistics: false, marketing: false }
  const decoded = decodeURIComponent(cookieValue)
  return {
    statistics: /statistics:true/.test(decoded),
    marketing: /marketing:true/.test(decoded),
  }
}

/**
 * Client-seitig: hat der User Analytics (Cookiebot-Kategorie 'statistics')
 * freigegeben? Bevorzugt die Cookiebot-JS-API, faellt auf Cookie-Parsing zurueck.
 */
export function hasTrackingConsent(): boolean {
  if (typeof window === 'undefined') return false
  const cb = (
    window as unknown as { Cookiebot?: { consent?: { statistics?: boolean } } }
  ).Cookiebot
  if (cb?.consent) return cb.consent.statistics === true
  if (typeof document === 'undefined') return false
  const m = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + COOKIEBOT_COOKIE_NAME + '=([^;]+)'),
  )
  return parseCookiebotConsent(m?.[1]).statistics
}
