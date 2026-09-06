'use client'

// Microsoft Clarity IM EMBED-iframe.
//
// WARUM ES DAS BRAUCHT: Clarity auf der Elternseite (claimondo.de) zeichnet den
// Inhalt eines cross-origin-iframes NICHT auf. Auf `/check` und
// `/gutachter-finden` lief die Aufzeichnung damit genau auf dem Teil, in dem
// nichts passiert — der Finder selbst, in dem der Nutzer sucht, tippt und
// abbricht, war eine Blackbox. Genau dort lag der Befund vom 04.09.: 9
// Anzeigenklicks, 0 Leads.
//
// WARUM DIE ID VON DER ELTERNSEITE KOMMT: Derselbe Embed laeuft auch auf Seiten
// OHNE Clarity (z. B. `/werkstatt-finden`, `/schaden-melden/selbstverschulden`).
// Waere die ID hier fest verdrahtet, zeichnete der iframe auch dort auf — auf
// Seiten, fuer die das nie eingeschaltet wurde. Die einbettende Seite entscheidet.
//
// WARUM TROTZDEM EINE ALLOWLIST: Der Parameter kaeme sonst ungeprueft aus der
// URL, und jeder koennte dem Embed eine fremde Project-ID unterschieben. Nur
// bekannte Projekte werden akzeptiert.
//
// CONSENT: Der iframe kann das Consent-Cookie der Elternseite nicht lesen
// (cross-origin). Er hoert deshalb auf dieselbe postMessage-Bruecke wie die
// ConsentBridge nebenan (AAR-956) und startet Clarity erst bei
// `analytics_storage: 'granted'`. Ohne Einwilligung wird nichts geladen.

import { useEffect, useRef } from 'react'
import Clarity from '@microsoft/clarity'
import { isTrustedParentOrigin } from '../_lib/trusted-origin'

/**
 * Bekannte Clarity-Projekte, die ein Parent anfordern darf.
 *
 * `y7ve121jr0` = das Projekt der Anzeigen-Ziele (`/check`, `/gutachter-finden`).
 * Es entspricht `CLARITY_ID_ANZEIGEN_ZIELE` im Marketing-Build; die beiden
 * Builds teilen keinen Code, deshalb steht der Wert hier zwingend ein zweites
 * Mal. Eine neue ID gehoert in BEIDE Listen.
 */
const ERLAUBTE_PROJEKTE = new Set(['y7ve121jr0'])

export function ClarityEmbed({ projectId }: { projectId?: string | null }) {
  const gestartet = useRef(false)

  useEffect(() => {
    if (!projectId || !ERLAUBTE_PROJEKTE.has(projectId)) return

    const starte = () => {
      if (gestartet.current) return
      gestartet.current = true
      try {
        Clarity.init(projectId)
      } catch {
        /* Blocker/Netzfehler: Aufzeichnung ist ein Zusatz, nie ein Blocker fuer den Finder. */
      }
    }

    function onMessage(e: MessageEvent) {
      if (!isTrustedParentOrigin(e.origin)) return
      const data = e.data as { type?: string; gcm?: Record<string, unknown> } | null
      if (!data || data.type !== 'claimondo-consent' || !data.gcm) return
      // Genau ein Signal zaehlt: Clarity ist Analyse, nicht Werbung.
      if (data.gcm.analytics_storage === 'granted') starte()
    }

    window.addEventListener('message', onMessage)

    // Ready-Handshake wie in der ConsentBridge: Der Parent sendet den Consent
    // erneut, sobald sich ein Listener meldet. Ohne das ginge die erste
    // Nachricht verloren, wenn der Parent schneller ist als dieser Effekt.
    // Zwei Ready-Pings (Bridge + hier) sind unkritisch — der Parent sendet dann
    // zweimal denselben Zustand, und `gestartet` verhindert eine Doppel-Init.
    try {
      window.parent?.postMessage({ type: 'claimondo-consent-ready' }, '*')
    } catch {
      /* kein Parent / sandboxed → no-op */
    }

    return () => window.removeEventListener('message', onMessage)
  }, [projectId])

  return null
}
