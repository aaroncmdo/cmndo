'use client'

import { useEffect, useRef } from 'react'

// ProvenExpert ProSeal — das offizielle, schwebende Trust-Siegel (sticky rechts OBEN).
//
// ABGRENZUNG zum server-seitigen Siegel: <ProvenExpertSiegel> im Home-Trust-Strip holt
// Note + Anzahl ueber die Rating-API und rendert sie im Claimondo-Design, ohne dass der
// Besucher-Browser ProvenExpert kontaktiert. Das hier ist das ProSeal-WIDGET von
// ProvenExpert selbst — eigenes Design, eigene Reviews-Ansicht, sticky am Rand.
//
// KEIN CONSENT-GATE — Entscheidung Aaron 13.08.2026.
// Das Siegel laedt auf jedem Seitenaufruf, unabhaengig vom CMP. Damit haengt es nicht
// mehr an der Kategorie „Statistik"; entsprechend ist es dort auch nicht mehr genannt
// (ConsentManager) — ein CMP, das eine Kategorie fuer etwas verantwortlich macht, das
// sie gar nicht steuert, waere schlimmer als gar kein Hinweis.
//
// Was dabei tatsaechlich passiert (am 13.08. im Browser gemessen, nicht abgeleitet):
//   • Request an s.provenexpert.net + d.provenexpert.net -> die IP des Besuchers geht
//     an einen Dritten (Expert Systems AG, Berlin)
//   • EIN Eintrag in sessionStorage: `PE_PRO_SEAL_CACHE` (Note/Anzahl, damit nicht
//     jeder Seitenaufruf neu laedt) — endet mit dem Schliessen des Tabs
//   • KEINE Cookies, KEIN localStorage
// Genau so steht es in der Datenschutzerklaerung, Abschnitt 9.6, mit Art. 6 Abs. 1
// lit. f als Rechtsgrundlage und Widerspruch nach Art. 21 ueber die dort genannte
// Kontaktadresse.
//
// ⚠ Wer das wieder an eine Einwilligung haengen will, muss BEIDES anfassen: dieses
// Gate und den Rechtstext in 9.6. Ein Auseinanderlaufen von Technik und Text ist der
// Fehler, der hier schon zweimal passiert ist.
//
// Konfiguration = das Snippet aus dem ProvenExpert-Dashboard (Marketing → ProSeal),
// 1:1 uebernommen; `widgetId` ist account-gebunden.
//
// ⚠ `bottom` unten ist WIRKUNGSLOS und bleibt nur stehen, damit das Snippet
// unveraendert nachvollziehbar ist: die vertikale Position kommt aus der Regel
// `.pe-pro-seal` in app/globals.css (top statt bottom, mit !important). Das Widget
// bietet keine top-Option — Begruendung und Messwerte stehen dort.
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
  // Mobil AUS. Gemessen 24.08.2026 per document.elementFromPoint auf der H1-Flaeche
  // von fuenf Seiten (/, /kosten-kfz-gutachten, /unfall-was-tun-als-geschaedigter,
  // /kfz-haftpflicht-schaden, /check):
  //
  //   390px Viewport   H1 zu 15-33 % verdeckt
  //   320px Viewport   H1 zu  7-33 % verdeckt
  //   1440px Desktop   0 %
  //
  // Das ausgeklappte Siegel misst 260x232 px und sitzt per `top: 340px`
  // (globals.css) mitten im Hero. Auf Desktop steht daneben genug Platz, auf
  // Mobil schneidet es die Kernbotschaft an: „Unverschulde[t im] Unfall?".
  // Eine andere Position loest das nicht — bei 40 % der Viewport-Breite und
  // 35 % der Hoehe gibt es keine Stelle, an der es nichts Wichtiges verdeckt.
  //
  // Das Trust-Signal geht dadurch nicht verloren: <ProvenExpertSiegel> rendert
  // Note und Anzahl serverseitig im Claimondo-Design (HomeTrustStripSection).
  // Nebeneffekt: auf Mobil entfaellt der Drittanbieter-Request an
  // s.provenexpert.net — genau dort, wo die Verbindung am haeufigsten schlecht ist.
  hideOnMobile: true,
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
  const gestartetRef = useRef(false)

  useEffect(() => {
    if (gestartetRef.current) return
    gestartetRef.current = true

    const w = window as ProvenExpertWindow
    const init = () => {
      try {
        w.provenExpert?.proSeal?.({ ...PROSEAL_CONFIG })
      } catch {
        // Siegel ist Beiwerk — ein Fehler darf die Seite nie stoeren.
      }
    }

    // Script schon da (z. B. nach Client-Navigation)? Dann nur initialisieren —
    // ein zweites Injizieren gaebe doppelte Badges.
    if (w.provenExpert?.proSeal) {
      init()
      return
    }

    const s = document.createElement('script')
    s.src = PROSEAL_SRC
    s.async = true
    s.addEventListener('load', init)
    document.head.appendChild(s)
  }, [])

  return null
}
