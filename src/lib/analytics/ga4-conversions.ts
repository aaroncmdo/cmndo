// Server-side Conversion-Helpers: liest die GA4 client_id (consent-respektierend)
// und feuert Conversions via Measurement Protocol (ga4-mp.ts). Fire-and-forget.
//
// SERVER-ONLY (nutzt next/headers cookies() + GA4_MP_API_SECRET via ga4-mp).
// Hooks: generate_lead / flowlink_sent / sa_signed.

import { cookies } from 'next/headers'
import { parseGaClientId, sendGa4Event, type Ga4Event } from './ga4-mp'
import { CONSENT_COOKIE_NAME, parseConsent } from './consent'

/**
 * Ø-Provision pro unterschriebener SA (EUR) — wird als `value` an die
 * sa_signed-Conversion gehaengt fuer value-based Bidding in Google Ads
 * (Aaron 26.05.2026). Proxy-Mittelwert, kein exakter Umsatz pro Fall.
 */
export const SA_SIGNED_VALUE_EUR = 210

/**
 * GA4 client_id aus dem `_ga`-Cookie des aktuellen Requests — aber NUR wenn
 * Tracking-Consent erteilt ist (consent-respektierend). Sonst null.
 * Nur im Request-Kontext nutzbar (Server-Action/Route mit Cookies).
 */
export async function getConsentedGaClientId(): Promise<string | null> {
  try {
    const store = await cookies()
    // Consent-respektierend: nur bei 'statistics'-Consent.
    const consent = parseConsent(store.get(CONSENT_COOKIE_NAME)?.value)
    if (!consent.statistics) return null
    return parseGaClientId(store.get('_ga')?.value)
  } catch {
    // Kein Request-Kontext (z.B. Cron/Hintergrund) → keine client_id.
    return null
  }
}

/**
 * Feuert eine server-side Conversion an GA4, wenn eine client_id vorhanden ist
 * (== Consent war erteilt). Fire-and-forget, wirft nie.
 * `clientId` kommt aus getConsentedGaClientId() (live) oder der gespeicherten
 * anfragen/leads.ga_client_id (spaetere Events ohne User-Request).
 */
export async function trackServerConversion(
  clientId: string | null | undefined,
  event: Ga4Event,
): Promise<void> {
  if (!clientId) return
  await sendGa4Event({ clientId, events: [event], consentGranted: true })
}
