'use client'

// Generischer iframe-Wrapper für die App-Embed-Finder (Gutachter UND Werkstatt, #18 P4).
// Extrahiert aus GutachterFindenSection (AAR-956 WS6), damit die Consent-Bridge + die
// Click-ID-Durchreiche nicht dupliziert werden — die beiden Finder unterscheiden sich
// nur in Pfad + Titel. Konsumenten nutzen die dünnen Wrapper (GutachterFindenSection /
// WerkstattFindenSection), nicht diese Datei direkt.
//
// Der interaktive Finder ist als <iframe> auf den Haupt-App-Embed eingebettet
// (app.claimondo.de/embed/<finder>). Höhe via `height` (default '100dvh').
// EMBED_ORIGIN pro Env via NEXT_PUBLIC_EMBED_ORIGIN.
//
// AAR-956 Consent-Bridge: 'use client', weil der Embed-iframe (cross-origin) den Consent der
// Parent-Seite nicht automatisch erbt. Wir reichen den GCM-v2-State per postMessage durch
// (Handshake + CONSENT_CHANGED_EVENT) → der iframe-Container hebt von default=denied an.
//
// ⚠ allow="geolocation" ist PFLICHT am iframe — sonst ist „Aktuellen Standort verwenden"
// im Embed tot (Permissions-Policy blockt Geolocation in cross-origin-iframes).

import { useEffect, useRef } from 'react'
import {
  CONSENT_COOKIE_NAME,
  CONSENT_CHANGED_EVENT,
  parseConsent,
  categoriesToGcm,
} from '@/lib/analytics/consent'

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

export type EmbedFinderSectionProps = {
  /** Embed-Pfad in der Haupt-App, z.B. '/embed/gutachter-finder' oder '/embed/werkstatt-finder'. */
  embedPath: string
  /** iframe-title (a11y). */
  title: string
  /** Start-Zentrum (z.B. aus ?plz/?stadt server-geocodet). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** Container-Höhe (default '100dvh' = Vollseite; In-Page z.B. '70vh'). */
  height?: string
  /**
   * AAR-956: Google-Ads-Click-IDs (gclid/gbraid/wbraid/gclsrc) aus der Parent-URL → an die
   * iframe-`src`, damit der Conversion-Linker im iframe-Container `_gcl_aw` schreibt (Attribution).
   */
  clickIds?: { gclid?: string; gbraid?: string; wbraid?: string; gclsrc?: string }
  /**
   * Partner-/Makler-Promo-Code (?promo=MK-…) aus der Parent-URL → an die iframe-`src`,
   * damit der Embed ihn am Lead attribuiert (promotion_code_id, Provision-Spur).
   */
  promoCode?: string
  /**
   * GEO-Deep-Link (`?sv=<profiles.id>`): der Gutachter, den eine KI-Antwort oder ein
   * Verzeichnis-Link bereits genannt hat → im Embed als Vorauswahl im Wizard. Rein
   * darstellend: der Embed prueft die ID gegen sein Matching-Ergebnis und faellt bei
   * Unbekanntem still auf den bestgerankten SV zurueck.
   */
  svId?: string
  /**
   * GEO-Deep-Link (`?slot=<ISO-Start>`): der Termin, den die KI-Antwort genannt hat.
   * Nur zusammen mit `svId` sinnvoll. Ist der Slot beim Klick belegt, faellt der Embed
   * still auf die normale Terminauswahl zurueck.
   */
  slot?: string
  /**
   * `utm_source` der Einstiegs-URL — z.B. `chatgpt.com`, das ChatGPT an jeden von ihm
   * ausgegebenen Link selbst anhaengt.
   *
   * WARUM EIGENS DURCHGEREICHT: der Embed laeuft cross-origin im iframe. Die
   * Attributions-Mechanik der App liest den REFERER, und der ist dort unsere eigene
   * Domain — der urspruengliche Wert geht also verloren. Ohne diese Zeile zaehlen wir
   * KI-Buchungen, wissen aber nicht, WELCHE KI sie gebracht hat.
   */
  utmSource?: string
  /**
   * Clarity-Projekt-ID fuer die Aufzeichnung IM iframe.
   *
   * WARUM VON HIER UND NICHT AUS DEM EMBED: Clarity auf dieser Seite zeichnet den
   * Inhalt des cross-origin-iframes NICHT auf — der Finder, in dem der Nutzer
   * tatsaechlich arbeitet, bliebe unsichtbar. Der Embed traegt die ID aber
   * bewusst nicht selbst: derselbe iframe laeuft auch auf Seiten OHNE Clarity
   * (`/werkstatt-finden`, `/schaden-melden/selbstverschulden`), und dort soll
   * nichts aufgezeichnet werden. Nur die einbettende Seite weiss, ob sie trackt.
   *
   * Der Embed prueft den Wert gegen eine Allowlist und startet erst, wenn der
   * Consent per postMessage `analytics_storage: 'granted'` meldet.
   */
  clarityId?: string
  /** Standort des Fahrzeugs aus dem Deeplink — die KI hat ihn im Gespraech erfragt.
   *  Der Embed ueberspringt damit den Ort-Schritt (nur wirksam mit initialCenter). */
  adresse?: string
  /**
   * Schadenart aus dem Deeplink („Parkschaden", „Auffahrunfall", …).
   *
   * ⚠ NACHGETRAGEN 28.08.2026 — sie fehlte hier, obwohl `llms.txt` die KI seit dem
   * 25.08. ausdruecklich anweist, `&schadenart=` an `/gutachter-finden` zu haengen.
   * Diese Allowlist verwarf den Wert still: der Embed hat ihn nie gesehen, der Kunde
   * musste die Art trotzdem waehlen. Kein Fehler, keine leere Seite — nur die
   * versprochene Ersparnis blieb aus. Der Smoke war gruen, weil er `stadt=`/`adresse=`
   * testete und `schadenart=` nie an eine URL haengte.
   */
  schadenart?: string
  /**
   * Schuldfrage aus dem Deeplink (`gegner` | `unklar`). Der Embed validiert sie erneut
   * gegen die CHECK-Schnittmenge; hier wird sie nur durchgereicht.
   */
  schuldfrage?: string
  /**
   * OpenAI-Ads-Attribution (`oppref`) — dieselbe Aufgabe wie `clickIds` fuer Google.
   *
   * WARUM EIGENS DURCHGEREICHT: Das `__oppref`-Cookie gehoert zu claimondo.de, der
   * Embed laeuft cross-origin auf app.claimondo.de und sieht es nicht. Ohne diese
   * Zeile entstehen Embed-Leads ohne jede Zuordnung — und das ist nicht der Randfall,
   * sondern der GROESSTE Lead-Kanal (gemessen 03.09.2026: 43 Leads ueber den nativen
   * Finder gegen 6 ueber den Mini-Wizard). Die Anzeigen saehen dann so aus, als
   * brachten sie fast nichts.
   *
   * Der Wert wird server-seitig ermittelt (Prop statt document.cookie im Render):
   * ein erst nach der Hydration ergaenzter Parameter wuerde die iframe-`src` aendern
   * und den Finder neu laden — mitten in der Eingabe des Kunden.
   */
  oppref?: string
}

/** Aktueller Consent-State (aus cc_cookie) als GCM-v2-Update-Payload für den iframe. */
function currentGcm(): Record<string, 'granted' | 'denied'> {
  if (typeof document === 'undefined') return categoriesToGcm({ statistics: false, marketing: false })
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'))
  return categoriesToGcm(parseConsent(m?.[1]))
}

export function EmbedFinderSection({
  embedPath,
  title,
  initialCenter = null,
  initialZoom,
  height = '100dvh',
  clickIds,
  promoCode,
  svId,
  slot,
  utmSource,
  adresse,
  schadenart,
  schuldfrage,
  oppref,
  clarityId,
}: EmbedFinderSectionProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Das server-geocodete Start-Zentrum als ?lat&lng[&zoom] an den Embed durchreichen.
  const params = new URLSearchParams()
  if (initialCenter) {
    params.set('lat', String(initialCenter.lat))
    params.set('lng', String(initialCenter.lng))
    if (initialZoom) params.set('zoom', String(initialZoom))
  }
  // Ads-Click-IDs in die iframe-URL durchreichen (Allowlist — keine beliebigen Params).
  for (const key of ['gclid', 'gbraid', 'wbraid', 'gclsrc'] as const) {
    const v = clickIds?.[key]
    if (v) params.set(key, v)
  }
  // Promo-Code (Makler-/Partner-Attribution) — der Embed resolved + persistiert ihn am Lead.
  if (promoCode) params.set('promo', promoCode)
  // GEO-Deep-Link: den im Chat genannten Gutachter als Vorauswahl weiterreichen.
  if (svId) params.set('sv', svId)
  // Nur mit svId sinnvoll: der Slot gehoert zu genau diesem Gutachter.
  if (svId && slot) params.set('slot', slot)
  // Welche KI den Kunden geschickt hat — reine Attribution, nie ein Steuerwert.
  if (utmSource) params.set('utm_source', utmSource.slice(0, 150))
  // Nur MIT Koordinaten sinnvoll: ohne initialCenter kann der Embed nichts damit anfangen.
  if (adresse && initialCenter) params.set('adresse', adresse.slice(0, 200))
  // Schadenart + Schuldfrage aus dem Deeplink. Anders als `adresse` OHNE Koordinaten-
  // Bedingung: beide sind fuer sich nuetzlich (die Schadenart fuellt den Schaden-Schritt
  // vor, die Schuldfrage spart spaeter den Quali-Schritt im FlowLink), auch wenn der
  // Kunde seinen Ort noch selbst eingeben muss. Der Embed validiert beide gegen feste
  // Wertelisten — ein unbekannter Wert faellt dort still weg.
  if (schadenart) params.set('schadenart', schadenart.slice(0, 60))
  if (schuldfrage) params.set('schuldfrage', schuldfrage.slice(0, 30))
  // OpenAI-Ads-Attribution — das Gegenstueck zu den Google-Click-IDs oben. Der Wert
  // ist eine undurchsichtige Kennung von OpenAI, deshalb grosszuegig begrenzt statt
  // auf ein Format geprueft: eine zu enge Pruefung wuerde ihn still verwerfen.
  if (oppref) params.set('oppref', oppref.slice(0, 300))
  // Aufzeichnung im iframe — nur wenn DIESE Seite selbst Clarity fuehrt.
  // Der Embed gleicht den Wert gegen seine Allowlist ab.
  if (clarityId) params.set('clarity', clarityId)
  const qs = params.toString()
  const src = `${EMBED_ORIGIN}${embedPath}${qs ? `?${qs}` : ''}`

  // Consent-Propagation: GCM-State per postMessage an den iframe — getriggert durch (a) den
  // „ready"-Handshake des iframe (ConsentBridge meldet sich, wenn ihr Listener steht → löst die
  // Race „Parent sendet zu früh") und (b) jede Consent-Änderung (CONSENT_CHANGED_EVENT vom CMP).
  useEffect(() => {
    function sendConsent() {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      try {
        win.postMessage({ type: 'claimondo-consent', gcm: currentGcm() }, EMBED_ORIGIN)
      } catch {
        /* iframe weg / cross-origin-Block → no-op */
      }
    }
    function onIframeReady(e: MessageEvent) {
      if (e.origin === EMBED_ORIGIN && (e.data as { type?: string } | null)?.type === 'claimondo-consent-ready') {
        sendConsent()
      }
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, sendConsent)
    window.addEventListener('message', onIframeReady)
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, sendConsent)
      window.removeEventListener('message', onIframeReady)
    }
  }, [])

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      loading="lazy"
      allow="geolocation"
      style={{ width: '100%', height, border: 'none', display: 'block' }}
    />
  )
}
