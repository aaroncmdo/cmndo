// Shared Tracking-Consent + Host-Gating. Quelle: vanilla-cookieconsent (cc_cookie).
// Plain-Modul (kein 'use server'/'use client') -> server+client importierbar.

export const CONSENT_COOKIE_NAME = 'cc_cookie'            // orestbida v3 default
export const CONSENT_CHANGED_EVENT = 'claimondo:consent-changed'
export const CONSENT_POLICY_VERSION = '2026-05-27'

/** GA4/Ads-Tracking-Hosts (gtag laedt nur hier). */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])
/**
 * Marketing-Hosts, auf denen das CMP/Banner laeuft (breiter; LP inkl.). NICHT Portale.
 *
 * Das sind ALLE Hosts, die die Marketing-App bedient (siehe
 * .github/workflows/deploy-vps-marketing.yml). gutachter/schaden/makler kamen am
 * 13.08.2026 dazu, als das ProvenExpert-Siegel auf alle Marketing-Seiten sollte:
 * das Widget laedt einen Drittanbieter im Besucher-Browser, und ein Besucher muss
 * dem widersprechen koennen. Ohne CMP gaebe es dafuer keinen Weg — die Liste hier
 * ist also die Bedingung dafuer, dass das Siegel dort ueberhaupt laufen DARF,
 * nicht bloss Beiwerk.
 */
const MARKETING_HOSTS = new Set([
  'claimondo.de',
  'www.claimondo.de',
  'kfzgutachter.claimondo.de',
  'gutachter.claimondo.de',
  'schaden.claimondo.de',
  'makler.claimondo.de',
])

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

/** Client: das cc_cookie lesen und in beide Kategorien aufloesen. */
function readConsentCookie(): ConsentState {
  if (typeof document === 'undefined') return { statistics: false, marketing: false }
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'))
  return parseConsent(m?.[1])
}

/** Client: hat der User statistics (analytics) freigegeben? */
export function hasTrackingConsent(): boolean {
  return readConsentCookie().statistics
}

/**
 * Client: hat der User marketing (ads) freigegeben?
 *
 * Getrennt von hasTrackingConsent, weil das CMP zwei Kategorien fuehrt und ein
 * WERBE-Pixel unter `ads` gehoert, nicht unter `analytics`. Wer nur Statistik
 * erlaubt hat, darf kein Ads-Pixel geladen bekommen — sonst ist die Auswahl im
 * Banner folgenlos und das Opt-out steht nur auf dem Papier.
 *
 * Erster Consumer: OaiqInit (OpenAI Ads). Clarity bleibt bewusst bei
 * hasTrackingConsent — Session-Analyse ist Statistik, kein Werbe-Tracking.
 */
export function hasMarketingConsent(): boolean {
  return readConsentCookie().marketing
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
