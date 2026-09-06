'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// Versteckt die Siegel-Karte auf der Guide-Landeseite selbst.
//
// Warum ueberhaupt: dort steht das vollstaendige Formular. Eine schwebende
// Karte, die zum Guide einlaedt, waehrend man auf seiner Seite steht, ist
// bestenfalls Rauschen — gemessen ueberlappt sie dort ausserdem als einziges
// Vorkommen ein Bedienelement (1 Ueberschneidung bei 1280 und 1440; blockiert
// hat sie es nicht, aber verdecken muss sie es auch nicht).
//
// Warum eine Huelle statt einer Bedingung in der Karte: die Karte ist eine
// Server-Komponente und uebersetzt server-seitig — `unfallguide` liegt bewusst
// NICHT in `CLIENT_NAMESPACES`, damit die 50 Schluessel nicht auf jeder der 70
// Seiten in den Browser gehen. Der Pfad ist aber nur im Client bekannt. Also
// baut der Server den Inhalt, und dieser winzige Client entscheidet, ob er
// erscheint.
//
// `localePrefix: 'as-needed'` heisst: Deutsch ohne Praefix, die uebrigen fuenf
// mit. Beide Formen muessen greifen.
const GUIDE_PFAD = /^\/(?:en|tr|ar|ru|pl)?\/?unfallguide(?:\/|$)/

export function GuideSiegelKarteHuelle({ children }: { children: ReactNode }) {
  const pfad = usePathname()
  if (pfad && GUIDE_PFAD.test(pfad)) return null
  return <>{children}</>
}
