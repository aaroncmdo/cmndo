// OpenAI Ads (OAIQ) — Attribution einsammeln UND Conversions senden.
//
// SERVER-ONLY (nutzt next/headers cookies()).
// Muster: ga4-conversions.ts / getConsentedGaClientId.
//
// ⚠ ZWILLINGSDATEI: src/lib/analytics/oaiq-capi.ts (App-Build) sendet dieselben
// Events. Die Payload-Form MUSS in beiden identisch bleiben — weicht eine ab,
// fehlt die Haelfte der Messung, ohne dass irgendwo ein Fehler auftaucht.
// Gegen genau diese Drift laeuft `oaiq-payload-zwilling.test.ts`: er vergleicht
// den `baueOaiqPayload`-Block beider Dateien als Text. Wer hier etwas an der
// Payload aendert und drueben nicht, bekommt einen roten Test statt eines
// stillen Messlochs.

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { CONSENT_COOKIE_NAME, parseConsent } from './consent'

/**
 * Name des First-Party-Cookies, in das das OAIQ-SDK den `oppref`-Wert aus der
 * Landing-URL schreibt.
 *
 * ⚠ Aus der OpenAI-Doku uebernommen, an einer LIVE-Installation noch nicht
 * verifiziert — dafuer braucht es einen echten Anzeigenklick. Erster
 * Verifikationsschritt nach dem Livegang: DevTools → Application → Cookies auf
 * claimondo.de. Weicht der Name ab, ist das hier die einzige Stelle zum Aendern.
 * Bis dahin gilt: ein fehlendes Cookie sieht identisch aus wie "kein
 * Anzeigenklick" — beides liefert null.
 */
const OPPREF_COOKIE = '__oppref'

/**
 * `oppref` aus dem Pixel-Cookie des aktuellen Requests — aber NUR bei
 * MARKETING-Consent (Kategorie `ads`), nicht bei blossem Statistik-Consent.
 * Analog zu getConsentedGaClientId(), das dasselbe mit `_ga` und `statistics` tut.
 *
 * Nur im Request-Kontext nutzbar (Server-Action / Route Handler).
 *
 * Liefert null bei: kein Anzeigenklick, kein Marketing-Consent, kein
 * Request-Kontext. Alle drei sind normale Zustaende, kein Fehler — der
 * Aufrufer speichert dann schlicht nichts.
 */
export async function getConsentedOppref(): Promise<string | null> {
  try {
    const store = await cookies()
    const consent = parseConsent(store.get(CONSENT_COOKIE_NAME)?.value)
    if (!consent.marketing) return null
    return store.get(OPPREF_COOKIE)?.value ?? null
  } catch {
    // Kein Request-Kontext (z.B. Cron/Hintergrund) → keine Attribution.
    return null
  }
}

/**
 * `oppref` fuer die Weitergabe an den Embed-iframe (cross-origin auf
 * app.claimondo.de, wo das Cookie von claimondo.de nicht sichtbar ist).
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *  1. `?oppref=` aus der aktuellen URL — der Fall „direkt aus der Anzeige auf
 *     diese Seite geklickt". Frischester Wert.
 *  2. das `__oppref`-Cookie — der Fall „ueber die Anzeige gekommen, dann im
 *     Angebot weitergeklickt". Ohne diesen Zweig verlaere jede Navigation vor
 *     der Buchung die Zuordnung.
 *
 * Beide nur bei Marketing-Consent: eine Kennung, die ohne Einwilligung nicht
 * gespeichert werden darf, darf auch nicht cross-origin weitergereicht werden.
 */
export async function opprefFuerEmbed(ausUrl?: string | null): Promise<string | undefined> {
  try {
    const store = await cookies()
    // Ein Gate fuer BEIDE Quellen. Der URL-Parameter braucht es genauso wie das
    // Cookie: er steht in der Adresszeile, voellig unabhaengig von jeder
    // Einwilligung — ihn ungeprueft weiterzureichen waere eine Uebermittlung
    // hinter dem Ruecken des Consent-Banners.
    if (!parseConsent(store.get(CONSENT_COOKIE_NAME)?.value).marketing) return undefined
    return ausUrl || store.get(OPPREF_COOKIE)?.value || undefined
  } catch {
    // Kein Request-Kontext → nichts durchzureichen.
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Conversions API
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://bzr.openai.com/v1/events'

/**
 * Ein haengender Werbe-Call darf keinen Lead blockieren. Das GA4-Muster
 * (`ga4-mp.ts`) setzt keinen Timeout — dort ist es vertretbar, weil der
 * Measurement-Protocol-Endpunkt praktisch immer sofort antwortet. Hier wird
 * mitten im Absende-Weg des Kunden gewartet, also wird die Wartezeit begrenzt.
 */
const SENDE_TIMEOUT_MS = 3000

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
  sourceUrl?: string
  /** Nur fuer Tests/Diagnose: laesst die API validieren, ohne ein Event zu buchen. */
  validateOnly?: boolean
}

/**
 * ⚠ ZWILLINGS-BLOCK — muss in src/lib/analytics/oaiq-capi.ts textgleich stehen.
 * Aenderungen hier ohne dort brechen `oaiq-payload-zwilling.test.ts`.
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
      ...(p.sourceUrl ? { source_url: p.sourceUrl } : {}),
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
 * Genau danach wuerde man tagelang an der falschen Stelle suchen.
 *
 * `timestamp_ms` muss in den letzten 7 Tagen liegen — bei allen Aufrufern hier
 * ist das Ereignis gerade eben passiert, der Wert ist also immer frisch.
 */
export async function sendOaiqEvent(p: OaiqPayloadInput | (Omit<OaiqPayloadInput, 'oppref'> & { oppref: string | null })): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_OAIQ_PIXEL_ID
  const apiKey = process.env.OAIQ_API_KEY
  // Ohne oppref gibt es nichts zuzuordnen — das ist der Normalfall bei
  // organischem Verkehr und KEIN Fehler.
  if (!pixelId || !apiKey || !p.oppref) return

  try {
    const res = await fetch(`${ENDPOINT}?pid=${encodeURIComponent(pixelId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(baueOaiqPayload({ ...p, oppref: p.oppref }, Date.now())),
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

/**
 * `oppref` an einem frisch entstandenen Lead festhalten. EIN Aufruf je
 * Lead-Pfad, direkt nachdem die Lead-ID feststeht.
 *
 * Warum ein Helper statt sechs Copy-Paste-Bloecke: `lead_created` entsteht an
 * SECHS Stellen im Marketing-Build, vier davon ueber `anfragen` +
 * `convert_anfrage_zu_lead` (die RPC ist fest verdrahtet und reicht keine
 * beliebigen Felder durch — es braucht dort ohnehin einen Nachtrag-Update).
 * Sechsmal dieselben acht Zeilen waeren sechs Stellen, an denen der naechste
 * Umbau eine vergessen kann.
 *
 * ⚠ NICHT fire-and-forget, und der Fehler wird geprueft: `leads` steht auf der
 * Liste kritischer Tabellen (AGENTS.md §Stille-Write-Gate, Baseline 0). Der
 * naheliegende Vorlage-Write fuer `ga_client_id` in
 * create-lead-from-mini-wizard.ts:101 ist genau so einer OHNE Pruefung —
 * bewusst nicht kopiert. Ein stillschweigend fehlgeschlagenes oppref-Update
 * kostet die Attribution des gesamten Pfades, ohne dass irgendwo etwas rot wird.
 *
 * Wirft nie: die Lead-Anlage ist zu diesem Zeitpunkt bereits erfolgreich und
 * darf an einem Attributions-Detail nicht scheitern.
 *
 * ⚠ Speichern UND Melden liegen bewusst in EINEM Aufruf. Zwei nebeneinander
 * stehende Aufrufe je Pfad waeren sechs Gelegenheiten, den zweiten zu
 * vergessen — und ein vergessenes `lead_created` faellt nirgends auf, es fehlt
 * nur eine Zahl im Ads Manager. Der gespeicherte `oppref` traegt spaeter
 * Termin und Auftrag; das Event meldet den Lead selbst. Beides gehoert zum
 * selben Ereignis und wird aus demselben Cookie-Lesevorgang bedient.
 */
export async function erfasseLeadAttribution(leadId: string): Promise<void> {
  const oppref = await getConsentedOppref()
  // Kein Anzeigenklick oder kein Marketing-Consent → nichts zu speichern.
  // Das ist der Normalfall bei organischem Verkehr, kein Fehler.
  if (!oppref) return

  try {
    const { error } = await createServiceClient()
      .from('leads')
      .update({ oppref })
      .eq('id', leadId)
    if (error) {
      console.error('[oaiq] oppref nicht gespeichert — Attribution verloren:', leadId, error.message)
    }
  } catch (err) {
    console.error('[oaiq] oppref-Update:', leadId, (err as Error).message)
  }

  // Auch wenn der DB-Write oben scheitert: das Ereignis ist trotzdem passiert
  // und wird gemeldet. Der gespeicherte Wert dient den SPAETEREN Events
  // (Termin, Auftrag) — ihn zu verlieren ist schlimm genug, ohne zusaetzlich
  // den Lead selbst aus der Zaehlung zu nehmen.
  //
  // ⚠ NICHT awaited, anders als der DB-Write darueber. Diese Funktion wird von
  // den Lead-Pfaden im Absende-Weg des Kunden awaited; ein `await` hier hinge
  // seinen Fortschritt an die Antwortzeit eines Werbeservers (bis zu
  // SENDE_TIMEOUT_MS). Dasselbe Muster nutzt der GA4-Pfad
  // (`void trackServerConversion(...)`) aus demselben Grund. Zulaessig ist das,
  // weil die App auf einem dauerhaften Node-Prozess laeuft (VPS/PM2) — auf
  // einer Serverless-Plattform wuerde der Aufruf beim Return abgeschnitten.
  void sendOaiqEvent({ oppref, eventId: leadId, eventName: 'lead_created' })
}
