// OpenAI Ads (OAIQ) — Conversions aus dem App-Build melden.
//
// SERVER-ONLY (liest OAIQ_API_KEY).
//
// ⚠ ZWILLINGSDATEI: claimondo-marketing/lib/analytics/oaiq-capi.ts sendet
// dieselben Events. Die Payload-Form MUSS in beiden identisch bleiben — weicht
// eine ab, fehlt die Haelfte der Messung, ohne dass irgendwo ein Fehler
// auftaucht. Dagegen laeuft `oaiq-payload-zwilling.test.ts`: er vergleicht den
// `baueOaiqPayload`-Block beider Dateien als Text.
//
// DER UNTERSCHIED ZUM MARKETING-ZWILLING: hier gibt es keinen Cookie-Leser.
// Das `__oppref`-Cookie lebt auf claimondo.de; dieser Build laeuft auf
// app.claimondo.de, und die Ereignisse (Termin, Auftrag) passieren oft Tage
// nach dem Anzeigenklick. Der Wert kommt deshalb ausschliesslich aus
// `leads.oppref` — dorthin geschrieben von `erfasseLeadAttribution()` im
// Marketing-Build, im Moment der Lead-Anlage.

import { CONSENT_COOKIE_NAME, parseConsent } from './consent'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Conversions API
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://bzr.openai.com/v1/events'

/**
 * Ein haengender Werbe-Call darf keinen Funnel-Schritt blockieren. Das
 * GA4-Muster (`ga4-mp.ts`) setzt keinen Timeout — dort ist es vertretbar, weil
 * der Measurement-Protocol-Endpunkt praktisch immer sofort antwortet. Hier
 * wird mitten im Weg des Kunden gewartet, also wird die Wartezeit begrenzt.
 */
const SENDE_TIMEOUT_MS = 3000

/** Fallback, wenn kein Referer lesbar ist (Cron/Hintergrund, spaetere Events). */
const BASIS_URL = 'https://app.claimondo.de'

/**
 * Die Seite, auf der das Ereignis stattfand — Pflichtfeld der API
 * (source_url_required_for_web).
 *
 * Hier greift der Fallback haeufiger als im Marketing-Build: Termin und
 * Auftrag werden teils aus fire-and-forget-Bloecken gemeldet, in denen kein
 * Request-Kontext mehr steht. Ein grober Wert ist besser als ein verworfenes
 * Event — die Zuordnung traegt ohnehin der oppref.
 */
async function ermittleSourceUrl(): Promise<string> {
  try {
    const { headers } = await import('next/headers')
    const referer = (await headers()).get('referer')
    if (referer && /^https?:\/\//.test(referer)) return referer
  } catch {
    // kein Request-Kontext
  }
  return BASIS_URL
}

export type OaiqEventName = 'lead_created' | 'appointment_scheduled' | 'order_created'

/**
 * Jedes Standard-Event hat eine vorgeschriebene Daten-Form ("data shape").
 * Falsche Form → das Event wird verworfen.
 *
 * Quelle: https://developers.openai.com/ads/measurement-pixel, abgeglichen mit
 * den vom Ads Manager erzeugten Beispiel-Snippets (03.09.2026).
 */
const DATA_SHAPE: Record<OaiqEventName, 'customer_action' | 'contents'> = {
  lead_created: 'customer_action',
  appointment_scheduled: 'customer_action',
  order_created: 'contents',
}

export type OaiqPayloadInput = {
  oppref: string
  eventId: string
  eventName: OaiqEventName
  /** ISO-4217-Minor-Units (Cent). Nur bei `order_created` sinnvoll. */
  amountCents?: number
  /**
   * PFLICHT bei `action_source: 'web'` — die API lehnt das Event sonst ab:
   * `{"code":"source_url_required_for_web"}`, HTTP 400.
   *
   * ⚠ Das war bis zum 04.09.2026 optional modelliert (so stand es in der
   * Einbau-Vorlage) und wurde von KEINEM Aufrufer gesetzt. Jedes Event waere
   * still verworfen worden. Aufgefallen ist es erst beim Probelauf gegen die
   * echte API mit `validate_only` — kein Test und kein Typcheck haette es
   * gefunden, weil die Form syntaktisch gueltig war.
   */
  sourceUrl: string
  /** Nur fuer Tests/Diagnose: laesst die API validieren, ohne ein Event zu buchen. */
  validateOnly?: boolean
}

/**
 * ⚠ ZWILLINGS-BLOCK — muss in claimondo-marketing/lib/analytics/oaiq-capi.ts
 * textgleich stehen. Aenderungen hier ohne dort brechen
 * `oaiq-payload-zwilling.test.ts`.
 *
 * Zur Attribution: Die vom Ads Manager erzeugte Beispiel-Anfrage enthaelt
 * ueberhaupt kein Attributionsfeld — sie zeigt nur die Pflichtfelder. Die Doku
 * nennt zwei Wege: Top-Level `oppref` (Rohwert aus der Landing-URL) und
 * `user.obref` (Cookie-Wert). Welchen das Backend auswertet, laesst sich von
 * aussen nicht feststellen. Deshalb beide — ein ignoriertes Zusatzfeld kostet
 * nichts, ein fehlendes kostet die gesamte Zuordnung.
 */
export function baueOaiqPayload(p: OaiqPayloadInput, jetztMs: number) {
  return {
    validate_only: p.validateOnly === true,
    events: [{
      id: p.eventId,
      type: p.eventName,
      timestamp_ms: jetztMs,
      action_source: 'web',
      // Unbedingt gesetzt, nicht bedingt: bei action_source 'web' ist das Feld
      // Pflicht (source_url_required_for_web). Gegen die echte API geprueft.
      source_url: p.sourceUrl,
      oppref: p.oppref,
      user: { obref: p.oppref },
      data: {
        type: DATA_SHAPE[p.eventName],
        ...(p.amountCents != null ? { amount: p.amountCents, currency: 'EUR' } : {}),
      },
    }],
  }
}

/**
 * Eine Conversion an OpenAI melden. Wirft nie — Tracking darf den Funnel nicht
 * blockieren.
 *
 * ⚠ Der Fehlerfall wird GEPRUEFT und geloggt, anders als bei `sendGa4Event`.
 * Der Unterschied ist beabsichtigt: GA4 quittiert auch unsinnige Events mit
 * 2xx, ein Status-Check waere dort wertlos. OAIQ antwortet dagegen mit echten
 * Fehlern — ein falscher Schluessel (401) oder eine abgelehnte Payload-Form
 * (400) waere ohne diese Pruefung ein dauerhaft stiller Totalausfall der
 * Messung, bei dem der Ereignisstream im Ads Manager schlicht leer bleibt.
 *
 * `timestamp_ms` muss in den letzten 7 Tagen liegen — bei allen Aufrufern hier
 * ist das Ereignis gerade eben passiert, der Wert ist also immer frisch.
 */
export async function sendOaiqEvent(
  p: Omit<OaiqPayloadInput, 'oppref' | 'sourceUrl'> & { oppref: string | null; sourceUrl?: string },
): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_OAIQ_PIXEL_ID
  const apiKey = process.env.OAIQ_API_KEY
  // Ohne oppref gibt es nichts zuzuordnen — das ist der Normalfall bei
  // organischem Verkehr und KEIN Fehler.
  if (!pixelId || !apiKey || !p.oppref) return

  // Die Widerrufs-Pruefung sitzt HIER und nicht an den Aufrufstellen: dort
  // waere sie an jeder einzelnen vergessbar, und ein vergessener Widerruf ist
  // kein Anzeigefehler, sondern eine Uebermittlung ohne Rechtsgrundlage.
  if (await marketingWiderrufen()) return

  // Quell-URL hier statt als Parameter — sie gehoert zum Request, nicht zur
  // Fachlogik, und waere an jeder Aufrufstelle einzeln vergessbar. Ein
  // fehlendes Pflichtfeld laesst die API das Event still verwerfen.
  const sourceUrl = p.sourceUrl ?? (await ermittleSourceUrl())

  try {
    const res = await fetch(`${ENDPOINT}?pid=${encodeURIComponent(pixelId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(baueOaiqPayload({ ...p, oppref: p.oppref, sourceUrl }, Date.now())),
      signal: AbortSignal.timeout(SENDE_TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[oaiq] ${p.eventName} abgelehnt (HTTP ${res.status}) fuer ${p.eventId}:`, text.slice(0, 300))
    }
  } catch (err) {
    console.error(`[oaiq] ${p.eventName} nicht gesendet fuer ${p.eventId}:`, (err as Error).message)
  }
}

// ---------------------------------------------------------------------------
// oppref aus dem Lead
// ---------------------------------------------------------------------------

/**
 * Wurde die Marketing-Einwilligung SICHTBAR widerrufen?
 *
 * Der Datenschutztext sagt zu: „einen erteilten Widerruf setzen wir unmittelbar
 * um." Diese Pruefung loest das ein, soweit sie es kann — und nur soweit.
 *
 * ⚠ BEWUSSTE GRENZE: Das CMP laeuft auf claimondo.de, nicht auf app.* (siehe
 * MARKETING_HOSTS in consent.ts). Ist das `cc_cookie` hier nicht lesbar, kann
 * ein spaeterer Widerruf an dieser Stelle nicht erkannt werden; es gilt dann
 * die Einwilligung, die zum Zeitpunkt der Lead-Anlage geprueft wurde (nur bei
 * ihr wurde `oppref` ueberhaupt gespeichert).
 *
 * Wichtig ist die Unterscheidung „Cookie fehlt" vs. „Cookie sagt nein":
 * `parseConsent(undefined)` liefert `marketing: false` — ein fehlendes Cookie
 * saehe also aus wie ein Widerruf und wuerde die Messung komplett abschalten.
 * Deshalb wird der ROHWERT geprueft, nicht das Ergebnis.
 */
async function marketingWiderrufen(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers')
    const roh = (await cookies()).get(CONSENT_COOKIE_NAME)?.value
    if (!roh) return false // kein Cookie lesbar → kein sichtbarer Widerruf
    return !parseConsent(roh).marketing
  } catch {
    // Kein Request-Kontext (Cron/Hintergrund) → nichts, was widerrufen sein koennte.
    return false
  }
}

/**
 * `oppref` eines Leads holen — oder null, wenn es keins gibt (organischer
 * Lead, der Normalfall).
 *
 * Die Widerrufs-Pruefung passiert bewusst NICHT hier, sondern in
 * `sendOaiqEvent`: Laden und Senden sind getrennt, damit Aufrufer, die den
 * Wert ohnehin schon aus einer bestehenden Abfrage haben, ihn direkt
 * weiterreichen koennen, ohne die Pruefung zu verlieren.
 *
 * Wirft nie: ein Attributions-Detail darf keinen Funnel-Schritt kippen.
 */
export async function ladeOpprefFuerLead(
  admin: SupabaseClient,
  leadId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('leads')
      .select('oppref')
      .eq('id', leadId)
      .maybeSingle()
    if (error) {
      console.error(`[oaiq] oppref nicht gelesen (Lead ${leadId}):`, error.message)
      return null
    }
    return (data?.oppref as string | null) ?? null
  } catch (err) {
    console.error(`[oaiq] oppref-Read (Lead ${leadId}):`, (err as Error).message)
    return null
  }
}
