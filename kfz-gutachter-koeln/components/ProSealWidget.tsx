'use client'

import { useEffect, useRef } from 'react'

// ProvenExpert ProSeal — das offizielle Trust-Siegel, sticky rechts oben.
//
// ⚠ WICHTIGER UNTERSCHIED ZU claimondo.de: Diese Cluster-LP faehrt ein echtes
// OPT-IN. Der Banner in components/CookieConsent.tsx zeigt sich, solange kein
// `cc_cookie` gesetzt ist, und nichts ist vorher freigegeben. Auf claimondo.de
// ist es umgekehrt (Default 'granted', CMP = Opt-out) — die dortige Komponente
// laedt deshalb schon ohne Entscheidung. Hier waere das FALSCH: geladen wird
// erst, wenn der Besucher 'analytics' aktiv gewaehlt hat.
//
// Das Widget holt s.provenexpert.net IM BESUCHER-BROWSER, seine IP geht also an
// einen Dritten. Die Datenschutzerklaerung dieser Seite ist claimondo.de/datenschutz
// (Abschnitt 9.6, dort beschrieben).
//
// Die Position liegt in app/globals.css (.pe-pro-seal) — das Widget kennt keine
// top-Option, Begruendung und Messwerte stehen dort.
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

/** Hat der Besucher 'analytics' aktiv gewaehlt? Ohne Cookie: nein (Opt-in). */
function hatStatistikFreigabe(): boolean {
  if (typeof document === 'undefined') return false
  const m = document.cookie.match(/(?:^|;\s*)cc_cookie=([^;]+)/)
  if (!m?.[1]) return false
  try {
    const daten = JSON.parse(decodeURIComponent(m[1])) as { categories?: string[] }
    return Array.isArray(daten.categories) && daten.categories.includes('analytics')
  } catch {
    return false
  }
}

export function ProSealWidget() {
  const gestartetRef = useRef(false)

  useEffect(() => {
    const start = () => {
      if (gestartetRef.current) return
      if (!hatStatistikFreigabe()) return

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
    }

    start()
    // 'cc:changed' feuert der Banner beim Speichern — sonst erschiene das Siegel
    // erst beim naechsten Seitenaufruf, obwohl gerade zugestimmt wurde.
    window.addEventListener('cc:changed', start)
    return () => window.removeEventListener('cc:changed', start)
  }, [])

  return null
}
