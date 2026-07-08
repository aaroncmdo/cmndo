'use client'

// Deep-Link-Fokus fuer /dispatch/rueckrufe?open=<admin_termine.id>.
// Dashboard, Gutachter-Finder-Benachrichtigungen, oeffentliche Rueckruf-
// Anfragen und der Updates-Router (lib/updates/split.ts) verlinken alle mit
// ?open=<terminId>. Die Server-Component hebt die Ziel-Zeile visuell hervor
// (bg/ring auf #rueckruf-<id>); dieser Client-Sidekick scrollt sie beim Laden
// sanft in den Viewport. Rendert nichts (null).

import { useEffect } from 'react'

export function RueckrufDeepLinkScroll({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(`rueckruf-${targetId}`)
    if (!el) return
    // rAF: erst nach dem ersten Paint scrollen, damit die Layout-Hoehe steht.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [targetId])

  return null
}
