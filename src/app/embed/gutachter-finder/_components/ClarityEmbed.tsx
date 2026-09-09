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
// `analytics_storage: 'granted'`. Seit 09.09.2026 (Aaron: Clarity wie GA4 auf
// Opt-out) sendet die Elternseite ohne Cookie 'granted' als Default — die
// Komponente selbst bleibt unveraendert consent-gesteuert. Kommt spaeter ein
// 'denied' (Widerspruch im CMP), entzieht sie Clarity die Einwilligung.
//
// WARUM ERST GEPRUEFT WIRD, OB CLARITY SCHON LAEUFT: Der GTM-Container derselben
// Seite (GTM-KD2L63T3) traegt ein eigenes Clarity-Tag. Gemessen 08.09.2026 auf
// prod, Embed ohne Elternseite und ohne jede Consent-Nachricht: `clarity.ms/tag/
// x5ey734m5b?ref=gtm` laedt 534 ms nach gtm.js und sendet Daten — das Tag ist
// nicht consent-gegated und deshalb IMMER vor uns da. Clarity vertraegt nur ein
// Projekt pro Seite (`window.clarity` ist global); ein zweites Tag daneben ist
// undefiniertes Verhalten. Diese Komponente laedt darum NUR, wenn noch kein
// Clarity-Tag existiert — und sagt in der Konsole, was im Weg steht. Sobald das
// GTM-Tag entfernt ist, greift sie ohne weiteren Deploy.

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

/**
 * Liefert die Projekt-ID eines bereits geladenen Clarity-Tags — oder `null`,
 * wenn keins da ist. Zwei Achsen, weil das Snippet `window.clarity` VOR dem
 * `<script>`-Einbau setzt: erst das Script-Element (traegt die ID in der URL),
 * dann die globale Funktion (ID unbekannt, aber eindeutig fremd).
 */
function laufendesClarityProjekt(): { id: string | null; quelle: string } | null {
  const tag = document.querySelector<HTMLScriptElement>('script[src*="clarity.ms/tag/"]')
  if (tag) {
    const id = /\/tag\/([a-z0-9]+)/i.exec(tag.src)?.[1] ?? null
    return { id, quelle: tag.src.includes('ref=gtm') ? 'GTM' : 'fremdes Tag' }
  }
  if (typeof (window as unknown as { clarity?: unknown }).clarity === 'function') {
    return { id: null, quelle: 'window.clarity ohne Script-Tag' }
  }
  return null
}

export function ClarityEmbed({ projectId }: { projectId?: string | null }) {
  const gestartet = useRef(false)

  useEffect(() => {
    if (!projectId || !ERLAUBTE_PROJEKTE.has(projectId)) return

    const starte = () => {
      if (gestartet.current) return
      gestartet.current = true

      const fremd = laufendesClarityProjekt()
      if (fremd) {
        if (fremd.id !== projectId) {
          console.warn(
            `[ClarityEmbed] Clarity laeuft bereits mit Projekt "${fremd.id ?? '?'}" (${fremd.quelle}). ` +
              `"${projectId}" wird NICHT zusaetzlich geladen — zwei Projekte auf einer Seite ` +
              `zerstoeren beide Aufzeichnungen. Damit "${projectId}" greift: das bestehende Tag ` +
              `im GTM-Container entfernen.`,
          )
        }
        return
      }

      try {
        Clarity.init(projectId)
        Clarity.consentV2({ ad_Storage: 'granted', analytics_Storage: 'granted' })
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
      // Widerspruch nach dem Start (CMP-Auswahl auf der Elternseite): Einwilligung entziehen.
      if (data.gcm.analytics_storage === 'denied' && gestartet.current) {
        try {
          Clarity.consentV2({ ad_Storage: 'denied', analytics_Storage: 'denied' })
        } catch {
          /* Clarity nicht geladen (fremdes Tag hatte Vorrang) → nichts zu entziehen */
        }
      }
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
