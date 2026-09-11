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
// nicht consent-gegated. Clarity vertraegt nur ein Projekt pro Seite
// (`window.clarity` ist global); ein zweites Tag daneben ist undefiniertes
// Verhalten. Diese Komponente laedt darum NUR, wenn kein fremdes Clarity-Tag
// existiert — und sagt in der Konsole, was im Weg steht. Sobald das GTM-Tag
// entfernt ist, greift sie ohne weiteren Deploy.
//
// ⚠ WARUM SIE NACH DEM CONSENT WARTET (Hotfix 09.09.2026): Mit dem Opt-out-
// Default (#5951) kommt die Consent-Nachricht sofort beim Ready-Handshake —
// also VOR dem GTM-Tag, das erst ~3 s nach Seitenstart injiziert wird. Die
// Pruefung fand nichts, initialisierte y7ve121jr0, und Sekunden spaeter kam
// x5ey734m5b dazu: zwei Tags auf prod (gemessen 09.09., 12:1x). Die alte
// Annahme "GTM ist immer zuerst da" galt nur, solange die Nachricht `denied`
// war.
//
// Gemessen dazu (09.09., prod): `window.clarity` traegt genau EINE Instanz —
// Clarity initialisiert nur das ZUERST geladene Tag, das zweite ist ein No-op.
// Zwei Tags sind also kein Doppel-Tracking, sondern ein RENNEN um das Projekt.
// Daraus folgen zwei Wege:
//   * OPT-OUT (`sofortStarten`, Default seit #5951): sofort beim Mount starten
//     — die Komponente laeuft in der Hydration, GTMs Tag kommt erst nach
//     gtm.js + Container (~1 s spaeter). y7ve121jr0 gewinnt deterministisch,
//     das GTM-Tag ist wirkungslos, kein Klick im GTM noetig. Ein spaeteres
//     `denied` vom Parent entzieht die Einwilligung (consentV2).
//   * OPT-IN (Rueckfall-Schalter): auf `granted` warten, danach bis zu
//     WARTEZEIT_MS auf ein fremdes Tag warten und erst dann entscheiden —
//     nie doppelt, dafuer 4 s spaeter.

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

/** So lange geben wir GTM nach dem Consent Zeit, sein eigenes Clarity-Tag zu setzen. */
const WARTEZEIT_MS = 4000
const PRUEFTAKT_MS = 200
// Frist zwischen dem Ready-Handshake und dem Sofortstart unter Opt-out. Sie existiert
// aus genau einem Grund: ein Widerspruch der Elternseite muss den Start VERHINDERN
// koennen, nicht erst danach die Einwilligung entziehen.
//
// Gemessen 09.09.2026 auf prod (Abnahme-Session, echter Widerspruch im Banner): der
// Sofortstart lief VOR jeder Consent-Nachricht, Clarity sendete DREI collect-Anfragen,
// und erst danach kam das `denied` an. Es floss also nicht nur ein Script — es flossen
// Daten. Ein postMessage-Roundtrip im selben Browser braucht Millisekunden; 250 ms sind
// grosszuegig, auch auf gedrosselter CPU.
//
// Preis: Unter Opt-out startet die Komponente 250 ms spaeter und kann damit das Rennen
// gegen das GTM-Clarity-Tag verlieren (gemessener Vorsprung war 86 ms). Das ist eine
// Frage der Messqualitaet — WELCHES Projekt aufzeichnet — und wiegt leichter als Daten,
// die trotz Widerspruch abfliessen. Sobald das GTM-Tag geloescht ist, gibt es kein
// Rennen mehr und die Frist kostet nichts.
const WIDERSPRUCHS_FRIST_MS = 250

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

export function ClarityEmbed({ projectId, sofortStarten = false }: { projectId?: string | null; sofortStarten?: boolean }) {
  const gestartet = useRef(false)
  const warteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Merkt einen Widerspruch, der zwischen Ready-Handshake und Sofortstart eintrifft.
  // Ohne dieses Flag genuegt das Loeschen des Timers nicht: eine Nachricht, die exakt
  // nach dem Timer-Ablauf ankommt, faende den Start bereits vollzogen.
  const widersprochen = useRef(false)

  useEffect(() => {
    if (!projectId || !ERLAUBTE_PROJEKTE.has(projectId)) return

    // Entscheidet erst, wenn ein fremdes Tag da ist ODER die Wartezeit um ist.
    const entscheide = (seit: number) => {
      const fremd = laufendesClarityProjekt()
      if (!fremd && Date.now() - seit < WARTEZEIT_MS) {
        warteTimer.current = setTimeout(() => entscheide(seit), PRUEFTAKT_MS)
        return
      }
      warteTimer.current = null
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

    const starte = () => {
      if (gestartet.current) return
      gestartet.current = true
      // Die Frist hat ihren Zweck erfuellt, sobald der Parent geantwortet hat.
      if (warteTimer.current) {
        clearTimeout(warteTimer.current)
        warteTimer.current = null
      }
      // Unter Opt-out die Wartezeit auf ein fremdes Tag ueberspringen — das ist der
      // Kern von #5959 (Rennen gegen das GTM-Tag). Weil die Bruecke typischerweise in
      // Millisekunden antwortet, startet Clarity bei Einwilligung damit praktisch
      // sofort; die 250-ms-Frist unten greift nur, wenn gar keine Antwort kommt.
      entscheide(sofortStarten ? Date.now() - WARTEZEIT_MS : Date.now())
    }

    function onMessage(e: MessageEvent) {
      if (!isTrustedParentOrigin(e.origin)) return
      const data = e.data as { type?: string; gcm?: Record<string, unknown> } | null
      if (!data || data.type !== 'claimondo-consent' || !data.gcm) return
      // Genau ein Signal zaehlt: Clarity ist Analyse, nicht Werbung.
      if (data.gcm.analytics_storage === 'granted') starte()
      // Widerspruch nach dem Start (CMP-Auswahl auf der Elternseite): Einwilligung entziehen.
      // Kommt er waehrend der Wartezeit, darf Clarity danach nicht mehr starten.
      if (data.gcm.analytics_storage === 'denied') {
        widersprochen.current = true
      }
      if (data.gcm.analytics_storage === 'denied' && warteTimer.current) {
        clearTimeout(warteTimer.current)
        warteTimer.current = null
      }
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
    //
    // ⚠ Der Ping steht VOR dem Sofortstart, nicht danach: sonst kann die Antwort
    // den Start gar nicht mehr verhindern — genau das war der Befund vom 09.09.
    try {
      window.parent?.postMessage({ type: 'claimondo-consent-ready' }, '*')
    } catch {
      /* kein Parent / sandboxed → no-op */
    }

    // Opt-out: nicht auf den Handshake warten — aber ihm eine kurze Frist geben.
    // Ohne die Frist lief der Start VOR jeder Consent-Nachricht, und Clarity sendete
    // trotz Widerspruch Daten (drei collect-Anfragen, gemessen 09.09. auf prod).
    // Meldet die Elternseite in dieser Frist `denied`, startet die Komponente gar nicht.
    // Laeuft bereits ein fremdes Tag (z. B. Re-Mount), greift die Pruefung in
    // `entscheide` wie sonst.
    if (sofortStarten) {
      warteTimer.current = setTimeout(() => {
        warteTimer.current = null
        // `gestartet` faengt den Fall ab, dass der Parent in der Frist `granted`
        // gemeldet hat — dann lief der Start schon ueber `starte()`.
        if (gestartet.current || widersprochen.current) return
        gestartet.current = true
        entscheide(Date.now() - WARTEZEIT_MS)
      }, WIDERSPRUCHS_FRIST_MS)
    }

    return () => {
      window.removeEventListener('message', onMessage)
      if (warteTimer.current) clearTimeout(warteTimer.current)
    }
  }, [projectId, sofortStarten])

  return null
}
