// AAR-956 Conversion-Tracking (Aaron 12.06., „relativ ähnlich zur Monika"):
//
// Zwei Kanäle, beide best-effort (blockieren nie), wie Monikas embed/monika/tracking.ts:
//   (1) window.dataLayer der iframe-Seite (eigenes GTM im iframe → GA4 + Google Ads Smart
//       Bidding), Marker `cl_event_source='gutachter_finder'`.
//   (2) Beacon an /api/embed-track (same-origin Haupt-App; die Route loggt + ist Stream-8b-bereit).
//
// Wertmodell = wie Monika (value-model.ts): die Reservierung ist ein Unfall-Gutachten-Lead
// (haftpflicht = 100 €), der Rückruf ein Beratungsgespräch (schadensberatung = 25 €). Werte hier
// inline gespiegelt (self-contained, kein Cross-Embed-Import) — bei Änderung beide angleichen.

export type GfEvent =
  | 'gf_shown'
  | 'gf_ort_gewaehlt'
  | 'gf_termin_gewaehlt'
  | 'gf_anfrage_submit'
  | 'gf_rueckruf'
  | 'phone_click'

interface DataLayerWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>
}

// EUR-Werte (Number, nie String — sonst ignoriert GA4/Ads das Wert-Bidding). Spiegelt Monikas
// VALUE_BY_SCHADENART: haftpflicht=100, schadensberatung=25.
const VALUE_RESERVIERUNG = 100
const VALUE_RUECKRUF = 25

/**
 * Normalisiert eine (deutsche) Telefonnummer auf E.164 (+49…) für Enhanced Conversions (GTM hasht
 * clientseitig SHA-256). Spiegelt Monikas toE164. Leere/unbrauchbare Eingabe → '' (nicht gepusht).
 */
function toE164(raw: string, cc = '49'): string {
  const s = (raw || '').replace(/[^\d+]/g, '')
  if (!s || s === '+') return ''
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  if (s.startsWith('0')) return '+' + cc + s.slice(1)
  if (s.startsWith(cc)) return '+' + s
  return '+' + cc + s
}

export function track(event: GfEvent, extra?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const props: Record<string, unknown> = {
    event,
    cl_event_source: 'gutachter_finder',
    ...extra,
  }

  // (1) dataLayer der iframe-Seite (GTM/GA4 + Ads Smart Bidding)
  try {
    const w = window as DataLayerWindow
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(props)
  } catch {
    /* kein dataLayer */
  }

  // (2) Beacon an /api/embed-track (same-origin). text/plain = simple request → kein CORS-Preflight
  // (sendBeacon kann keine preflighteten Requests senden); die Route liest via req.json() unabhängig.
  try {
    const body = JSON.stringify(props)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/embed-track', new Blob([body], { type: 'text/plain' }))
    } else {
      void fetch('/api/embed-track', {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
  } catch {
    /* Beacon best-effort */
  }
}

/**
 * value-based Conversion-Bag für die Reservierung (gf_anfrage_submit) — Wert + Währung + lead_id
 * (Dedupe/Transaction-ID) + E.164-Telefon (Enhanced Conversions). Leere Werte weglassen: ein leeres
 * lead_id würde GA4/Ads alle id-losen Conversions zu EINER zusammenfassen (Unterzählung).
 */
export function reservierungConversion(meta: { leadId?: string | null; telefon?: string | null }): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    schadenart: 'haftpflicht',
    value: VALUE_RESERVIERUNG,
    currency: 'EUR',
  }
  if (meta.leadId) extra.lead_id = meta.leadId
  const phone = meta.telefon ? toE164(meta.telefon) : ''
  if (phone) extra.phone = phone
  return extra
}

/** Conversion-Bag für den Rückruf (gf_rueckruf) — Beratungsgespräch = 25 €. */
export function rueckrufConversion(meta: { leadId?: string | null }): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    schadenart: 'schadensberatung',
    value: VALUE_RUECKRUF,
    currency: 'EUR',
  }
  if (meta.leadId) extra.lead_id = meta.leadId
  return extra
}
