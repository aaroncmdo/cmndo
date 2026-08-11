// Pure Scan-/Diff-Logik fuer das Fixed-Overlay-Safe-Area-Gate.
// Keine I/O, kein git -> unit-testbar. CLI-Wrapper: ../check-fixed-overlay-safearea.mjs
//
// HINTERGRUND (2x real passiert, beide Male nur per Hand-Smoke gefunden):
// Ein `position: fixed`-Overlay steht ausserhalb des Layout-Flusses und beansprucht
// seine Bildschirmecke DAUERHAFT. Landet Seiteninhalt dort, frisst das Overlay den
// Klick — der Nutzer trifft den FAB statt "Weiter".
//   16.07. ZB1-Footer      : FAB fing Klicks auf die Footer-Ecke ab
//   11.08. Embed-Wizard    : "Weiter" bei 1280x720 unklickbar (elementFromPoint -> FAB)
// Ein z-Index loest es NICHT (senken -> hinter Modals; heben -> frisst Klicks).
// Die Ecke muss im FLUSS reserviert werden: `lg:pb-*` auf dem scrollenden <main>.
//
// REGEL 1 (praezise, 0 FP): Wer ein bekanntes Ecken-Overlay mountet, MUSS im selben
//   File ein <main> mit lg-Safe-Area (>= MIN_SAFE_PB) haben.
// REGEL 2 (bewusst breit, Baseline grandfathert): NEUE unten-rechts fixierte Elemente
//   brauchen eine bewusste Entscheidung — persistentes Overlay (Safe-Area noetig) oder
//   fluechtig/harmlos (Toast, Drawer -> Baseline).

/** Bekannte persistente Ecken-Overlays (nur lg+ sichtbar). */
export const OVERLAY_COMPONENTS = ['GlobalPosteingangFab']

/** Mindest-Bodenreserve auf dem scrollenden <main> (FAB-Footprint 64px -> 5rem/80px). */
export const MIN_SAFE_PB = 20

// Kommentare RAUS, bevor irgendetwas gematcht wird. Sonst blendet ein Kommentar
// das Gate: die Shell-Erklaerung ("lg:pb-20 = Safe-Area fuer den FAB ...") steht als
// JSX-Kommentar IM <main>-Tag — ohne Stripping haette der Scan die Safe-Area auch
// dann "gefunden", wenn die Klasse selbst entfernt wurde (beim Selbsttest passiert).
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // Block- + JSX-Kommentare
    .replace(/\/\/[^\n]*/g, ' ') // Zeilen-Kommentare
}

/** Alle String-Literale (', ", `) eines Files — dort stehen die Tailwind-Klassen. */
function stringLiterals(src) {
  return [
    ...(src.match(/`(?:\\.|[^`\\])*`/g) ?? []),
    ...(src.match(/'(?:\\.|[^'\\])*'/g) ?? []),
    ...(src.match(/"(?:\\.|[^"\\])*"/g) ?? []),
  ]
}

/** Trifft die Klassenliste die untere rechte Ecke (fixed + bottom-* + right-*)? */
export function istEckenOverlayKlasse(cls) {
  if (!/\bfixed\b/.test(cls)) return false
  // Vollflaechige Overlays (Backdrops/Modals) sind keine Ecken-Overlays.
  if (/\binset-0\b/.test(cls)) return false
  const hatBottom = /(?:^|\s|:)bottom-/.test(cls)
  const hatRight = /(?:^|\s|:)right-/.test(cls)
  return hatBottom && hatRight
}

/**
 * REGEL 1 — Shell-Vertrag.
 * @param {string} src Inhalt einer .tsx
 * @returns {string|null} Verletzungs-Message oder null
 */
export function scanShellContent(src) {
  const code = stripComments(src)
  const mountet = OVERLAY_COMPONENTS.filter((c) => code.includes(`<${c}`))
  if (mountet.length === 0) return null

  // Oeffnende <main>-Tags. `[^>]*` reicht: die className-Ausdruecke der Shells
  // enthalten kein '>' (Ternaries/Template-Literals mit Klassennamen).
  const mains = code.match(/<main\b[^>]*>/gs) ?? []
  if (mains.length === 0) return null // kein eigenes <main> -> Vertrag greift woanders

  const hatSafeArea = mains.some((tag) => {
    for (const m of tag.matchAll(/lg:pb-(\d+)/g)) {
      if (Number(m[1]) >= MIN_SAFE_PB) return true
    }
    return false
  })
  if (hatSafeArea) return null
  return `mountet ${mountet.join('/')}, aber <main> hat keine lg:pb-${MIN_SAFE_PB}+ Safe-Area`
}

/**
 * REGEL 2 — neues Ecken-Overlay.
 * @param {string} src Inhalt einer .tsx
 * @returns {string|null} Verletzungs-Message oder null
 */
export function scanCornerOverlayContent(src) {
  for (const lit of stringLiterals(stripComments(src))) {
    const cls = lit.slice(1, -1)
    if (istEckenOverlayKlasse(cls)) {
      return 'fixiertes Element in der unteren rechten Ecke (fixed + bottom-* + right-*)'
    }
  }
  return null
}

/** @returns {{added: string[], removed: string[]}} */
export function diffBaseline(current, baseline) {
  const b = new Set(baseline)
  const c = new Set(current)
  return {
    added: current.filter((f) => !b.has(f)),
    removed: baseline.filter((f) => !c.has(f)),
  }
}
