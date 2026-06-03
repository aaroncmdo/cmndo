// Shared Tracking-Consent + Host-Gating. Quelle: vanilla-cookieconsent (cc_cookie).
// Plain-Modul (kein 'use server'/'use client') -> server+client importierbar.

export const CONSENT_COOKIE_NAME = 'cc_cookie'            // orestbida v3 default
export const CONSENT_CHANGED_EVENT = 'claimondo:consent-changed'
export const CONSENT_POLICY_VERSION = '2026-05-27'

/** GA4/Ads-Tracking-Hosts (gtag laedt nur hier). */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])
/** Marketing-Hosts, auf denen das CMP/Banner laeuft (breiter; LP inkl.). NICHT Portale. */
const MARKETING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de', 'kfzgutachter.claimondo.de'])

function matchHost(host: string | null | undefined, set: Set<string>): boolean {
  if (!host) return false
  const h = host.split(':')[0].toLowerCase()
  if (set.has(h)) return true
  if (process.env.NODE_ENV !== 'production' && (h === 'localhost' || h === '127.0.0.1')) return true
  return false
}

export function isTrackingHost(host: string | null | undefined): boolean { return matchHost(host, TRACKING_HOSTS) }
export function isMarketingHost(host: string | null | undefined): boolean { return matchHost(host, MARKETING_HOSTS) }

export type ConsentState = { statistics: boolean; marketing: boolean }

/** Parst das url-encodierte cc_cookie-JSON -> { statistics, marketing }. */
export function parseConsent(cookieValue: string | null | undefined): ConsentState {
  if (!cookieValue) return { statistics: false, marketing: false }
  try {
    const data = JSON.parse(decodeURIComponent(cookieValue)) as { categories?: string[] }
    const cats = Array.isArray(data.categories) ? data.categories : []
    return { statistics: cats.includes('analytics'), marketing: cats.includes('ads') }
  } catch { return { statistics: false, marketing: false } }
}

/** Client: hat der User statistics (analytics) freigegeben? */
export function hasTrackingConsent(): boolean {
  if (typeof document === 'undefined') return false
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'))
  return parseConsent(m?.[1]).statistics
}

/** Kategorie-State -> GCM-v2-Update-Payload. */
export function categoriesToGcm(c: ConsentState): Record<string, 'granted' | 'denied'> {
  return {
    analytics_storage: c.statistics ? 'granted' : 'denied',
    functionality_storage: c.statistics ? 'granted' : 'denied',
    ad_storage: c.marketing ? 'granted' : 'denied',
    ad_user_data: c.marketing ? 'granted' : 'denied',
    ad_personalization: c.marketing ? 'granted' : 'denied',
  }
}
