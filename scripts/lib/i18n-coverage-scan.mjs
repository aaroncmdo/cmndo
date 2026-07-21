// Pure Scan-Logik fuer check:i18n-coverage. Keine I/O -> unit-testbar.
// CLI-Wrapper: ../check-i18n-coverage.mjs
//
// Faengt die Klasse "DYNAMISCH adressierter i18n-Key existiert nicht":
// Code baut den Key zur Laufzeit aus einer TS-Union, z.B.
//   `${rolle extern ? 'subKunde' : 'subIntern'}.${lifecycle.subPhase}`   (subphase-visibility.ts)
// Fehlt ein Union-Wert in den Messages, wirft next-intl zur LAUFZEIT MISSING_MESSAGE
// und die UI rendert den ROHEN KEY.
//
// Warum check:i18n das NICHT faengt: der prueft nur die Paritaet ZWISCHEN den Locales.
// Fehlt ein Key in ALLEN 6 Locales, ist die Paritaet erfuellt -> gruen. Und
// check:i18n-render kompiliert nur DEFINIERTE Messages, kennt die Code-Referenzen nicht.
// Belegt 19.07. auf prod: `MISSING_MESSAGE: phasen.subIntern.reparatur_terminfindung (de)`
// — die Fallakte zeigte woertlich den Key. Derselbe Scan fand zusaetzlich filmcheck,
// qc-pruefung, anschlussschreiben und nachbesichtigung-laeuft (haeufige Zustaende!).

/**
 * Zieht die String-Literale einer TS-Union heraus.
 * CRLF-sicher (das Repo nutzt CRLF) und kommentar-sicher (Kommentare werden vor der
 * Literal-Extraktion entfernt, damit ein Wort in Anfuehrungszeichen im Kommentar nicht
 * als Union-Wert zaehlt). Terminator = naechste Leerzeile bzw. Dateiende.
 *
 * @param {string} src  TS-Quelltext
 * @param {string} typeName  z.B. 'ClaimSubPhase'
 * @returns {string[]|null} Werte oder null wenn der Typ nicht gefunden wurde
 */
export function extractUnionValues(src, typeName) {
  const code = String(src).replace(/\r/g, '')
  const re = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?)(?:\\n\\n|$)`)
  const m = re.exec(code)
  if (!m) return null
  const body = m[1]
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
  const vals = [...body.matchAll(/'([^'\n]+)'/g)].map((x) => x[1])
  return vals.length > 0 ? vals : null
}

/** Navigiert einen Punkt-Pfad ('phasen.subIntern') in einem Messages-Objekt. */
export function resolvePath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
}

/**
 * Welche Union-Werte haben KEINEN Key unter messagePath?
 * @returns {{error: string|null, missing: string[]}}
 */
export function findMissing(values, messages, messagePath) {
  const node = resolvePath(messages, messagePath)
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { error: `Namespace "${messagePath}" fehlt in den Messages`, missing: [] }
  }
  const have = new Set(Object.keys(node))
  return { error: null, missing: values.filter((v) => !have.has(v)) }
}

export function diffBaseline(current, baseline) {
  const base = new Set(baseline)
  const cur = new Set(current)
  return {
    added: current.filter((x) => !base.has(x)).sort(),
    removed: baseline.filter((x) => !cur.has(x)).sort(),
  }
}
