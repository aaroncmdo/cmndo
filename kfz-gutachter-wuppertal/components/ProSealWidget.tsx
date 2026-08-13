'use client'

import { useEffect, useRef } from 'react'

// ProvenExpert ProSeal — das offizielle Trust-Siegel, sticky rechts oben.
//
// KEIN CONSENT-GATE — Entscheidung Aaron 13.08.2026, gleich wie auf claimondo.de.
// Das Siegel laedt auf jedem Seitenaufruf, unabhaengig vom Cookie-Banner dieser
// Seite. Es haengt damit an KEINER Consent-Kategorie und wird im Banner deshalb
// auch nicht genannt — ein Schalter, der etwas zu steuern vorgibt, das er nicht
// steuert, waere schlimmer als gar kein Hinweis.
//
// Was dabei tatsaechlich passiert (am 13.08. im Browser gemessen):
//   • Request an s.provenexpert.net + d.provenexpert.net -> die IP des Besuchers
//     geht an einen Dritten (Expert Systems AG, Berlin)
//   • EIN Eintrag in sessionStorage: `PE_PRO_SEAL_CACHE` (nur Note + Anzahl),
//     endet mit dem Schliessen des Tabs
//   • KEINE Cookies, KEIN localStorage
// Rechtsgrundlage und Widerspruchsweg stehen in der Datenschutzerklaerung, auf die
// diese Seite verlinkt: claimondo.de/datenschutz, Abschnitt 9.6.
//
// ⚠ Wer das wieder an eine Einwilligung haengen will, muss BEIDES anfassen: dieses
// Gate und den Rechtstext in 9.6.
//
// Position: app/globals.css (.pe-pro-seal) — das Widget kennt keine top-Option.
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
  bottom: '30px', // wirkungslos — die CSS-Regel gewinnt, s. o.
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
