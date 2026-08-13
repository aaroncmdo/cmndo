'use client'

import { useEffect, useRef } from 'react'

import {
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE_NAME,
  parseConsent,
} from '@/lib/analytics/consent'

/**
 * Darf das Siegel laden? — OPT-OUT, passend zur Hausregel dieser Seite.
 *
 * claimondo.de faehrt Consent-Default **'granted'** (Anwalts-Freigabe + GF-Entscheid
 * 26.06.2026, siehe app/[locale]/layout.tsx); das CMP ist ein **Opt-out**, es gibt kein
 * Opt-in-Banner. `hasTrackingConsent()` liefert deshalb `false`, solange der Besucher
 * gar nichts entschieden hat — und genau das ist der Normalfall. Haengt man das Siegel
 * daran, erscheint es praktisch nie (auf prod verifiziert: 0 Requests, kein Badge).
 *
 * Richtig ist die gleiche Logik wie fuer Analytics/Clarity auf dieser Seite:
 *   • keine Entscheidung getroffen  -> laden (Default 'granted')
 *   • aktiv widersprochen           -> NICHT laden
 *
 * Damit respektiert das Siegel jeden Widerspruch, folgt aber der freigegebenen Linie
 * statt eine strengere Sonderregel zu sein.
 */
function darfSiegelLaden(): boolean {
  if (typeof document === 'undefined') return false
  const m = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'),
  )
  if (!m?.[1]) return true // keine Entscheidung -> Hausregel 'granted'
  return parseConsent(m[1]).statistics // Entscheidung liegt vor -> respektieren
}

// ProvenExpert ProSeal — das offizielle, schwebende Trust-Siegel (sticky rechts unten).
//
// ABGRENZUNG zum server-seitigen Siegel: <ProvenExpertSiegel> im Home-Trust-Strip holt
// Note + Anzahl ueber die Rating-API und rendert sie im Claimondo-Design, ohne dass der
// Besucher-Browser ProvenExpert kontaktiert. Das hier ist das ProSeal-WIDGET von
// ProvenExpert selbst — eigenes Design, eigene Reviews-Ansicht, sticky am Rand. Beide
// koennen nebeneinander stehen; das eine ist Inline-Trust im Strip, das andere das
// bekannte Badge.
//
// CONSENT (Opt-out, siehe darfSiegelLaden oben):
// Das Widget laedt `s.provenexpert.net` IM BESUCHER-BROWSER, die IP des Besuchers geht
// also an einen Dritten. Es respektiert daher jeden Widerspruch — folgt aber der
// Hausregel dieser Seite (Default 'granted', CMP = Opt-out) statt auf eine Einwilligung
// zu warten, die hier gar nicht eingeholt wird.
//
// Ablauf, analog zu Clarity (useClarityConsentInit):
//   - initial pruefen, bei erlaubtem Zustand sofort laden
//   - auf CONSENT_CHANGED_EVENT lauschen, falls der Besucher spaeter zustimmt
//   - einmal geladen bleibt geladen (ein erneutes Injizieren gaebe doppelte Badges)
//
// ⚠ Ein bereits geladenes Widget verschwindet nicht, wenn der Besucher waehrend der
// Sitzung widerspricht — das Script laesst sich nicht zurueckrufen. Beim naechsten
// Seitenaufruf greift der Widerspruch. Wer das haerter braucht, muss beim Widerruf
// reloaden; das ist bewusst nicht eingebaut, weil es jede CMP-Interaktion zu einem
// Seiten-Reload machen wuerde.
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
  // ABWEICHUNG vom Dashboard-Snippet (dort '30px') — die einzige.
  // Unten rechts sitzt bereits unsere fixe CTA-Leiste („Sofort anrufen / Rueckruf").
  // Live gemessen, nachdem das Siegel zum ersten Mal rendert:
  //   Desktop 1440x900: Siegel y 621-870, Leiste y 834-884  ->  36 px Ueberlappung
  //   Mobil    390x844: Siegel y 604-836, Leiste y 722-828  -> 106 px, die Leiste lag
  //                     also fast vollstaendig unter dem Siegel
  // Auf dem Handy verdeckte das Siegel damit den primaeren Call-to-Action — ein
  // Trust-Element darf keine Conversion kosten. 140px haelt in beiden Viewports
  // Abstand (Desktop 74 px, Mobil 18 px). Der Script-Default waere 110px und reichte
  // mobil NICHT (12 px Rest-Ueberlappung) — deshalb der eigene Wert.
  // ⚠ Wer die CTA-Leiste hoeher macht, muss hier nachziehen; die Zahl ist gemessen,
  // nicht gesetzt.
  bottom: '140px',
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
      if (!darfSiegelLaden()) return

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
