'use client'

import { useEffect, useRef } from 'react'

import { hasTrackingConsent, CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent'

// ProvenExpert ProSeal — das offizielle, schwebende Trust-Siegel (sticky rechts unten).
//
// ABGRENZUNG zum server-seitigen Siegel: <ProvenExpertSiegel> im Home-Trust-Strip holt
// Note + Anzahl ueber die Rating-API und rendert sie im Claimondo-Design, ohne dass der
// Besucher-Browser ProvenExpert kontaktiert. Das hier ist das ProSeal-WIDGET von
// ProvenExpert selbst — eigenes Design, eigene Reviews-Ansicht, sticky am Rand. Beide
// koennen nebeneinander stehen; das eine ist Inline-Trust im Strip, das andere das
// bekannte Badge.
//
// CONSENT-GATE (Pflicht, nicht optional):
// Das Widget laedt `s.provenexpert.net` IM BESUCHER-BROWSER. Damit geht die IP des
// Besuchers an einen Dritten — ohne Einwilligung waere das auf claimondo.de ein
// DSGVO-Verstoss, zumal die Seite Consent Mode v2 mit Default `denied` faehrt.
// Deshalb dasselbe Muster wie bei Clarity (useClarityConsentInit):
//   - initial pruefen, bei bereits erteiltem Consent sofort laden
//   - sonst auf CONSENT_CHANGED_EVENT lauschen und beim Granted nachladen
//   - einmal geladen bleibt geladen (ein erneutes Injizieren wuerde doppelte Badges geben)
//
// Gehaengt an die Kategorie `statistics` (hasTrackingConsent). Das ist die semantisch
// naechste vorhandene Kategorie — eine eigene Kategorie "externe Inhalte" gibt es im
// CMP (necessary / analytics / ads) nicht. Wer das Siegel ungegatet ausliefern will,
// aendert genau eine Stelle: den fruehen return in `start()` entfernen. Diese
// Entscheidung gehoert dann bewusst dokumentiert, nicht stillschweigend.
//
// Konfiguration = das Snippet aus dem ProvenExpert-Dashboard (Marketing → ProSeal),
// 1:1 uebernommen; `widgetId` ist account-gebunden.
const PROSEAL_SRC = 'https://s.provenexpert.net/seals/proseal-v2.js'
const PROSEAL_CONFIG = {
  widgetId: '8d507789-add3-47a2-aa80-c8c82937c29a',
  language: 'de-DE',
  usePageLanguage: false,
  bannerColor: '#097E92',
  textColor: '#FFFFFF',
  showReviews: true,
  hideDate: true,
  hideName: false,
  hideOnMobile: false,
  bottom: '30px',
  stickyToSide: 'right',
  googleStars: true,
  zIndex: '9999',
  displayReviewerLastName: false,
} as const

type ProvenExpertWindow = Window & {
  provenExpert?: { proSeal?: (config: Record<string, unknown>) => void }
}

export function ProSealWidget() {
  const startedRef = useRef(false)

  useEffect(() => {
    const start = () => {
      if (startedRef.current) return
      if (!hasTrackingConsent()) return

      startedRef.current = true

      const w = window as ProvenExpertWindow
      const init = () => {
        try {
          w.provenExpert?.proSeal?.({ ...PROSEAL_CONFIG })
        } catch {
          // Siegel ist Beiwerk — ein Fehler darf die Seite nie stoeren.
        }
      }

      // Script schon da (z. B. nach Client-Navigation)? Dann nur initialisieren.
      if (w.provenExpert?.proSeal) {
        init()
        return
      }

      const s = document.createElement('script')
      s.src = PROSEAL_SRC
      s.async = true
      s.addEventListener('load', init)
      document.head.appendChild(s)
    }

    start()
    window.addEventListener(CONSENT_CHANGED_EVENT, start)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, start)
  }, [])

  return null
}
