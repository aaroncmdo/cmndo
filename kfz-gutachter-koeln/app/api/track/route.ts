import { SITE } from '@/lib/site'

// Server-Side-Tracking-Endpoint (Beacon-Empfaenger). Phase 1: loggt nur
// (Sentry-Breadcrumb-aequivalent). Sobald NEXT_PUBLIC_GADS_AW_ID gesetzt ist,
// kann hier eine serverseitige Conversion-Weiterleitung (Measurement Protocol)
// ergaenzt werden. Antwortet immer 204 (Beacon erwartet keinen Body).
export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  try {
    const payload = await req.json().catch(() => null)
    if (payload && typeof payload === 'object') {
      const { event, cta_slot, city_slug } = payload as Record<string, unknown>
      // eslint-disable-next-line no-console
      console.log('[track]', { event, cta_slot, city_slug, gadsReady: Boolean(SITE.gadsAwId) })
    }
  } catch {
    /* Beacon darf nie 5xx werfen — Tracking ist non-critical. */
  }
  return new Response(null, { status: 204 })
}
