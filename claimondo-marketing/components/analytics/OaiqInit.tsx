'use client'

import { useEffect, useRef } from 'react'
import { hasMarketingConsent, CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent'

// OAIQ-Pixel (OpenAI Ads / ChatGPT Ads). Consent-gated + mount-only,
// nach dem Muster von useClarityConsentInit.
//
// Der Pixel dient AUSSCHLIESSLICH dem Einsammeln der Attribution: OpenAI haengt
// beim Anzeigenklick ein `oppref` an die Landing-URL, das SDK legt es im
// First-Party-Cookie `__oppref` ab. Conversions melden wir NICHT von hier,
// sondern serverseitig ueber die Conversions API (lib/analytics/oaiq-capi.ts).
// Gruende: Adblocker, die Terminstrecke laeuft cross-origin im iframe von
// app.claimondo.de, und die SA wird oft Tage spaeter unterschrieben — da gibt
// es die Browser-Session nicht mehr.
//
// ⚠ BEWUSST NICHT das Snippet aus der OpenAI-Doku 1:1 im <head>. Das
// initialisiert den Pixel bedingungslos bei jedem Besucher und umgeht damit
// CMP + Consent Mode.
//
// ⚠ `hasMarketingConsent`, NICHT `hasTrackingConsent`. Letzteres prueft die
// Kategorie `statistics` (analytics) — ein WERBE-Pixel gehoert unter `ads`.
// Mit der Statistik-Pruefung wuerde der Ads-Pixel auch bei Nutzern feuern, die
// im Banner ausdruecklich nur Statistik erlaubt haben.
//
// Kein SKIP_ROUTES wie bei ClarityInit: der Pixel MUSS auf jeder Landingpage
// laufen. Welche Seite eine Anzeige morgen anspricht, weiss heute niemand —
// eine seitenweise Einbindung bricht in dem Moment still.

type OaiqFn = ((...args: unknown[]) => void) & { q?: unknown[][] }
declare global {
  interface Window { oaiq?: OaiqFn }
}

const SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js'

export function OaiqInit() {
  const startedRef = useRef(false)

  useEffect(() => {
    const pixelId = process.env.NEXT_PUBLIC_OAIQ_PIXEL_ID
    // Ohne Pixel-ID still bleiben — gleiche Logik wie ClarityInit mit
    // NEXT_PUBLIC_CLARITY_ID, damit lokale Dev-Sessions kein Tracking starten.
    if (!pixelId) return

    const sync = () => {
      const granted = hasMarketingConsent()

      // Widerruf: das SDK laeuft schon -> Messung ueber sein eigenes
      // Consent-Flag stoppen. Ein reines Lade-Gate kann das nicht — einmal
      // geladen, laeuft der Pixel sonst nach einem Opt-out einfach weiter.
      if (!granted) {
        if (startedRef.current) window.oaiq?.('consent', false)
        return
      }

      // Erneute Einwilligung nach Widerruf.
      if (startedRef.current) {
        window.oaiq?.('consent', true)
        return
      }

      startedRef.current = true

      if (!window.oaiq) {
        const q: OaiqFn = Object.assign(
          (...args: unknown[]) => { q.q!.push(args) },
          { q: [] as unknown[][] },
        )
        window.oaiq = q
        const js = document.createElement('script')
        js.async = true
        js.src = SDK_URL
        document.head.appendChild(js)
      }
      // Laut OpenAI-Doku: consent VOR init setzen.
      window.oaiq('consent', true)
      window.oaiq('init', { pixelId })
    }

    sync()                                               // Wiederkehrer mit gespeichertem Consent
    window.addEventListener(CONSENT_CHANGED_EVENT, sync) // CMP-Auswahl UND Widerruf
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
  }, [])

  return null
}
