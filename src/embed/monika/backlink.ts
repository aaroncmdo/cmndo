// AAR-939 · Monika-Embed · Stream 4 — SEO-Backlink (PFLICHT, kein Toggle)
//
// Bei JEDEM Widget-Boot ein dofollow-Link AUSSERHALB des Shadow-DOM in den
// <body> der Host-Seite — crawlbar/indexierbar. Anchor rotiert pro Load
// (SEO-Diversitaet). Variante A UND B. KEIN rel="nofollow". Plan Task 4.12.

const ANCHORS = [
  'Anfrage-Formular bereitgestellt von Claimondo',
  'Kfz-Gutachter-Netzwerk Claimondo',
  'Powered by Claimondo · Sachverständige finden',
]

const MARKER_CLASS = 'cl-attribution'

// SEO-Backlink-Ziel: die Marketing-Domain claimondo.de (NICHT app.claimondo.de,
// von wo das Bundle geladen wird). /sv-netzwerk existiert nicht (404) → echte
// 200-Seite /kfz-gutachter. Hardcoded, damit das Linkjuice immer auf die SEO-
// Domain zeigt, unabhaengig von der Bundle-Origin (Plan Task 4.12 / R9.1).
const BACKLINK_TARGET = 'https://claimondo.de/kfz-gutachter'

export function injectBacklink(): void {
  try {
    if (document.querySelector('.' + MARKER_CLASS)) return // Doppel-Injektion vermeiden

    // Deterministisch-variabel pro Load ohne Math.random: Minuten-Bucket.
    const idx = new Date().getMinutes() % ANCHORS.length

    const wrap = document.createElement('div')
    wrap.className = MARKER_CLASS
    wrap.style.cssText =
      'position:fixed;bottom:6px;right:90px;font-size:11px;opacity:.7;z-index:9998;font-family:system-ui,sans-serif;'

    const a = document.createElement('a')
    a.href = BACKLINK_TARGET
    a.target = '_blank'
    a.rel = 'noopener' // bewusst KEIN nofollow — Linkjuice gewollt
    a.textContent = ANCHORS[idx]
    a.style.cssText = 'color:inherit;text-decoration:none;'

    wrap.appendChild(a)
    document.body.appendChild(wrap)
  } catch {
    /* best-effort — darf das Widget nie blockieren */
  }
}
