// Server-side Conversion-Helpers: liest die GA4 client_id (consent-respektierend)
// und feuert Conversions via Measurement Protocol (ga4-mp.ts). Fire-and-forget.
//
// SERVER-ONLY (nutzt next/headers cookies() + GA4_MP_API_SECRET via ga4-mp).
// Hooks: generate_lead / flowlink_sent / sa_signed.

import { cookies } from 'next/headers'
import { parseGaClientId, sendGa4Event, type Ga4Event } from './ga4-mp'
import { COOKIEBOT_COOKIE_NAME, parseCookiebotConsent } from './consent'

/**
 * GA4 client_id aus dem `_ga`-Cookie des aktuellen Requests — aber NUR wenn
 * Tracking-Consent erteilt ist (consent-respektierend). Sonst null.
 * Nur im Request-Kontext nutzbar (Server-Action/Route mit Cookies).
 */
export async function getConsentedGaClientId(): Promise<string | null> {
  try {
    const store = await cookies()
    // Consent-respektierend: nur bei Cookiebot-'statistics'-Consent.
    const consent = parseCookiebotConsent(store.get(COOKIEBOT_COOKIE_NAME)?.value)
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
