// Server-side GA4 Measurement Protocol sender.
// SERVER-ONLY: liest GA4_MP_API_SECRET — NIE aus einer Client-Component
// importieren (Secret darf nicht ins Browser-Bundle). Wird von Conversion-
// Hooks (generate_lead / flowlink_sent / sa_signed) fire-and-forget genutzt.
//
// Measurement-ID = NEXT_PUBLIC_GA4_ID (build-time inlined, server-seitig
// lesbar). API-Secret = GA4_MP_API_SECRET (server-only, runtime via dotenv).

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

/**
 * Extrahiert die GA4 client_id aus dem `_ga`-Cookie.
 * Format: `GA1.<scope>.<clientId-part1>.<clientId-part2>` → client_id =
 * die letzten zwei Punkt-Segmente (`part1.part2`).
 */
export function parseGaClientId(gaCookie: string | null | undefined): string | null {
  if (!gaCookie) return null
  const parts = gaCookie.split('.')
  if (parts.length < 4) return null
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
}

export type Ga4Event = { name: string; params?: Record<string, unknown> }

/**
 * Sendet ein/mehrere Events server-seitig an GA4 (Measurement Protocol).
 * Fire-and-forget: wirft NIE (Tracking darf den Funnel nicht blockieren).
 * Graceful-skip wenn Measurement-ID/Secret fehlen oder keine clientId da ist
 * (keine clientId = kein Consent erfasst → consent-respektierend nichts senden).
 */
export async function sendGa4Event(opts: {
  clientId: string
  events: Ga4Event[]
  consentGranted?: boolean
}): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA4_ID
  const apiSecret = process.env.GA4_MP_API_SECRET
  if (!measurementId || !apiSecret) return
  if (!opts.clientId) return

  const consent = opts.consentGranted ? 'GRANTED' : 'DENIED'
  try {
    await fetch(
      `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: opts.clientId,
          events: opts.events,
          consent: { ad_user_data: consent, ad_personalization: consent },
        }),
      },
    )
  } catch (err) {
    console.warn('[ga4-mp] send failed (ignored):', err)
  }
}
