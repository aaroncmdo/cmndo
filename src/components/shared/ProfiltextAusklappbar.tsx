'use client'

// Ausklappbare Profilbeschreibung (Aaron 19.09.2026: "wenn die Profilbeschreibung zu lang ist,
// soll sie ausklappbar sein — gute Zeichenanzahl, damit die Profile nicht alles ueberdecken").
// Regel: @/lib/text/kuerze-profiltext (Limit 180, Toleranz 40, Schnitt am Wortende).
// Drei Renderstellen: Finder-Popup/Bottom-Sheet (SvProfilePopup), Self-Service-Terminwahl
// (SvSlotAuswahl), Team-Zone der Kundenakte (TeamZone). Der gekuerzte Text ist echter Text,
// kein CSS-Clamp: Screenreader lesen nichts doppelt, die Schaltflaeche ist ein Button mit
// aria-expanded, Touch-Ziel 44 px (primitives Button, size md).

import { useState } from 'react'
import { Button } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { kuerzeProfiltext } from '@/lib/text/kuerze-profiltext'

type ProfiltextAusklappbarProps = {
  text: string | null | undefined
  limit?: number
  toleranz?: number
  /** Beschriftung zugeklappt (Default deutsch; die Terminwahl reicht ihre i18n-Variante durch). */
  mehrLabel?: string
  /** Beschriftung aufgeklappt. */
  wenigerLabel?: string
  /** Typografische Anfuehrungszeichen um den Text („…“) — Finder-Popup. */
  anfuehrungszeichen?: boolean
  /** Heller Button-Ton fuer dunkle Karten (Self-Service, erste Karte im Embed). */
  hell?: boolean
  className?: string
  textClassName?: string
}

export function ProfiltextAusklappbar({
  text,
  limit,
  toleranz,
  mehrLabel = 'Mehr anzeigen',
  wenigerLabel = 'Weniger anzeigen',
  anfuehrungszeichen = false,
  hell = false,
  className,
  textClassName,
}: ProfiltextAusklappbarProps) {
  const [offen, setOffen] = useState(false)
  const voll = (text ?? '').trim()
  const { gekuerzt, text: kurz } = kuerzeProfiltext(voll, { limit, toleranz })
  if (!voll) return null
  const sichtbar = offen ? voll : kurz
  return (
    <div className={className}>
      <p className={cn(textClassName)}>{anfuehrungszeichen ? `„${sichtbar}“` : sichtbar}</p>
      {gekuerzt && (
        <Button
          variant={hell ? 'hell' : 'bare'}
          size="md"
          ariaExpanded={offen}
          onClick={() => setOffen((o) => !o)}
          className="-ml-4"
        >
          {offen ? wenigerLabel : mehrLabel}
        </Button>
      )}
    </div>
  )
}
