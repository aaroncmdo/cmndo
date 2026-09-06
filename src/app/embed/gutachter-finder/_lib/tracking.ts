// AAR-956 Conversion-Tracking (Aaron 12.06., „relativ ähnlich zur Monika"):
//
// Zwei Kanäle, beide best-effort (blockieren nie), wie Monikas embed/monika/tracking.ts:
//   (1) window.dataLayer der iframe-Seite (eigenes GTM im iframe → GA4 + Google Ads Smart
//       Bidding), Marker `cl_event_source='gutachter_finder'`.
//   (2) Beacon an /api/embed-track (same-origin Haupt-App; die Route loggt + ist Stream-8b-bereit).
//
// Wertmodell (an Monika value-model.ts angelehnt): die Reservierung ist ein Unfall-Gutachten-Lead
// (reservierter Termin = 150 €, Aaron 15.06. — höher gewichtet als Monikas haftpflicht-Lead 100 €),
// der Rückruf ein Beratungsgespräch (schadensberatung = 25 €, = Monika). Werte hier inline
// (self-contained, kein Cross-Embed-Import); Rückruf spiegelt Monika, Reservierung bewusst NICHT.

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

// EUR-Werte (Number, nie String — sonst ignoriert GA4/Ads das Wert-Bidding). Rückruf = Monikas
// VALUE_BY_SCHADENART.schadensberatung (25). Reservierter Termin GF-spezifisch 150 (Aaron 15.06.)
// — bewusst ABWEICHEND von Monikas haftpflicht-Lead (100), NICHT "zurück-syncen".
const VALUE_RESERVIERUNG = 150
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
  // user_data (E-Mail/Telefon/Name) ist NUR fürs clientseitige GTM/EC-Hashing → NICHT an den
  // Server-Beacon (Server-Analytics braucht keine PII; hält sie aus Log + künftigem Stream-8b-Persist).
  try {
    const beaconProps: Record<string, unknown> = { ...props }
    delete beaconProps.user_data
    const body = JSON.stringify(beaconProps)
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
 * Enhanced-Conversions-User-Data: ROHE (ungehashte) E-Mail/Telefon/Name in den dataLayer — GTM
 * hasht clientseitig SHA-256, BEVOR es an Google geht (und nur wenn Ihr Consent es zulässt).
 * Struktur = Googles `user_data` (email + phone_number E.164 + address{first/last_name}). Nur
 * nicht-leere Felder; `undefined` wenn nichts da ist (dann kein user_data im Push).
 */
function userDataBag(meta: {
  email?: string | null
  telefon?: string | null
  vorname?: string | null
  nachname?: string | null
}): Record<string, unknown> | undefined {
  const ud: Record<string, unknown> = {}
  const email = (meta.email ?? '').trim().toLowerCase()
  if (email) ud.email = email
  const phone = meta.telefon ? toE164(meta.telefon) : ''
  if (phone) ud.phone_number = phone
  const first = (meta.vorname ?? '').trim()
  const last = (meta.nachname ?? '').trim()
  if (first || last) {
    const address: Record<string, unknown> = {}
    if (first) address.first_name = first
    if (last) address.last_name = last
    ud.address = address
  }
  return Object.keys(ud).length > 0 ? ud : undefined
}

type ConversionMeta = {
  leadId?: string | null
  telefon?: string | null
  email?: string | null
  vorname?: string | null
  nachname?: string | null
}

/**
 * value-based Conversion-Bag für die Reservierung (gf_anfrage_submit) — Wert + Währung + lead_id
 * (Dedupe/Transaction-ID) + `user_data` (Enhanced Conversions for Leads: E-Mail/Telefon/Name).
 * Leeres lead_id weglassen, sonst fasst GA4/Ads alle id-losen Conversions zu EINER zusammen
 * (Unterzählung). EC ist hier der EIGENTLICHE Attributions-Mechanismus: die Conversion feuert im
 * iframe (app.claimondo.de), der Ad-Klick landet auf claimondo.de → kein gemeinsames GCLID-Cookie;
 * gehashte E-Mail/Telefon matchen die Conversion ohne Cookie zum Klick.
 */
export function reservierungConversion(meta: ConversionMeta): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    schadenart: 'haftpflicht',
    value: VALUE_RESERVIERUNG,
    currency: 'EUR',
  }
  if (meta.leadId) extra.lead_id = meta.leadId
  const ud = userDataBag(meta)
  if (ud) extra.user_data = ud
  return extra
}

/** Conversion-Bag für den Rückruf (gf_rueckruf) — Beratungsgespräch = 25 €, gleicher Lead + EC. */
export function rueckrufConversion(meta: ConversionMeta): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    schadenart: 'schadensberatung',
    value: VALUE_RUECKRUF,
    currency: 'EUR',
  }
  if (meta.leadId) extra.lead_id = meta.leadId
  const ud = userDataBag(meta)
  if (ud) extra.user_data = ud
  return extra
}
