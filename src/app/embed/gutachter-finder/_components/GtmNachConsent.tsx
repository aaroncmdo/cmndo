'use client'

// GTM im Embed-iframe — geladen ERST, wenn der Consent der Elternseite bekannt ist.
//
// WARUM: Bis zum 19.09.2026 rendete `page.tsx` das GTM-Snippet server-seitig mit
// `gtag('consent','default', {analytics_storage:'granted', …, wait_for_update:500})`.
// Der iframe behauptete damit eine Einwilligung, die er gar nicht kennen kann — er liest
// das Consent-Cookie der Elternseite nicht (cross-origin). GTM startete daraufhin sofort
// und feuerte sein eigenes Clarity-Tag `x5ey734m5b?ref=gtm`, das NICHT consent-gegated ist.
//
// GEMESSEN auf prod (19.09., echter Widerspruch im Banner, dann Seite neu geladen):
//   * Der Widerspruch lag vor (`cc_cookie` = nur `necessary`, Banner blieb weg).
//   * Unser eigenes Clarity (`y7ve121jr0`) startete korrekt NICHT — der Fix aus #5983 wirkt.
//   * Trotzdem flossen 5 `collect`-Anfragen: alle von `x5ey734m5b`, geladen via GTM.
//
// Warum `wait_for_update` das nicht löst: Der Wert stand auf 500 ms, die Consent-Nachricht
// der Elternseite traf in vier Messungen nach 1.176 / 1.810 / 3.955 / 5.127 ms ein. Und
// selbst mit passender Frist hielte GTM nur Tags zurück, die AUF Consent hören — das
// Clarity-Tag tut das nicht.
//
// DIE LÖSUNG, die ohne GTM-Zugriff auskommt: gar nicht erst laden. Meldet die Elternseite
// `denied`, wird GTM im iframe nie injiziert — dann kann auch ein ungegatetes Tag darin
// nichts senden. Meldet sie `granted`, lädt GTM mit `granted` als Default, und alles
// funktioniert wie zuvor, nur 1–5 s später.
//
// Preis, bewusst in Kauf genommen: Bei Widerspruch entfällt im iframe auch der
// cookielose Modeling-Ping des Advanced Consent Mode. Das ist der Unterschied zwischen
// „weniger Modellierungsdaten" und „Daten gegen den erklärten Willen des Nutzers".
//
// Sobald das Clarity-Tag im Container GTM-KD2L63T3 entfernt oder an `analytics_storage`
// gebunden ist, kann man hier wieder unbedingt laden (und der Modeling-Ping kommt zurück)
// — diese Komponente ist dann nur noch Gürtel zum Hosenträger.

import { useEffect, useRef } from 'react'
import { isTrustedParentOrigin } from '../_lib/trusted-origin'

/**
 * So lange warten wir auf die Antwort der Elternseite, bevor der Fallback greift.
 *
 * Gemessen (19.09., prod, vier Läufe): 1.176 / 1.810 / 3.955 / 5.127 ms bis zur ersten
 * `claimondo-consent`-Nachricht im iframe. 8 s decken auch den langsamsten Lauf mit
 * Reserve ab. Der Wert ist eine Obergrenze für den Ausnahmefall, kein Normalfall —
 * sobald eine Antwort da ist, lädt GTM sofort.
 */
const ANTWORT_FRIST_MS = 8000

type ConsentWert = 'granted' | 'denied'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

/**
 * Lädt den GTM-Container erst nach bekanntem Consent.
 *
 * @param gtmId Container-ID; ohne sie passiert nichts (env-gegated wie zuvor).
 * @param fallback Consent-Annahme, wenn die Elternseite gar nicht antwortet — etwa
 *   beim Direktaufruf des Embeds ohne einbettende Seite. Entspricht dem bisherigen
 *   `CONSENT_DEFAULT` und hält damit Aarons Opt-out-Entscheidung (09.09.) aufrecht.
 */
export function GtmNachConsent({ gtmId, fallback }: { gtmId: string; fallback: ConsentWert }) {
  const geladen = useRef(false)

  useEffect(() => {
    if (!gtmId) return

    const lade = (analytics: ConsentWert) => {
      if (geladen.current) return
      geladen.current = true

      // Bei Widerspruch: GTM gar nicht laden. Das ist der ganze Zweck dieser Komponente —
      // ein Container, der nicht existiert, kann kein ungegatetes Tag feuern.
      if (analytics === 'denied') {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[gtm-embed] Widerspruch der Elternseite — GTM wird nicht geladen.')
        }
        return
      }

      const dl = (window.dataLayer = window.dataLayer ?? [])
      // gtag schiebt seine Argumente unverändert in den dataLayer; GTM liest die
      // `arguments`-Form. Deshalb hier bewusst `arguments` statt eines Arrays.
      function gtag() {
        // eslint-disable-next-line prefer-rest-params
        dl.push(arguments)
      }
      const g = gtag as unknown as (...args: unknown[]) => void
      g('consent', 'default', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
        functionality_storage: 'granted',
        security_storage: 'granted',
      })
      dl.push({ 'gtm.start': Date.now(), event: 'gtm.js' })

      const s = document.createElement('script')
      s.async = true
      s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`
      document.head.appendChild(s)
    }

    function onMessage(e: MessageEvent) {
      if (!isTrustedParentOrigin(e.origin)) return
      const data = e.data as { type?: string; gcm?: Record<string, unknown> } | null
      if (!data || data.type !== 'claimondo-consent' || !data.gcm) return
      lade(data.gcm.analytics_storage === 'granted' ? 'granted' : 'denied')
    }

    window.addEventListener('message', onMessage)
    // Ready-Handshake wie in der ConsentBridge: Der Parent sendet den Consent erneut,
    // sobald sich ein Listener meldet. Zwei Pings (Bridge + hier) sind unkritisch.
    try {
      window.parent?.postMessage({ type: 'claimondo-consent-ready' }, '*')
    } catch {
      /* kein Parent / sandboxed → no-op */
    }

    // Kein Parent, keine Antwort (Direktaufruf des Embeds): nach der Frist mit dem
    // konfigurierten Default laden, damit der Embed ohne Elternseite messbar bleibt.
    const timer = setTimeout(() => lade(fallback), ANTWORT_FRIST_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
    // gtmId/fallback sind pro Seitenaufruf konstant (Server-Props) — mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
