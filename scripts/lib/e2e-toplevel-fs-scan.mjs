// Pure Scan-/Diff-Logik fuer die E2E-Toplevel-FS-Drift-Bremse.
// Keine I/O, kein git -> unit-testbar. CLI-Wrapper: ../check-e2e-toplevel-fs.mjs
//
// WARUM: Ein `readFileSync(...)` auf MODUL-EBENE einer Playwright-Spec wirft schon beim
// IMPORT, wenn die Datei fehlt -> die gesamte Playwright-COLLECTION crasht und reisst ALLE
// anderen Specs mit (auch die gesunden). Genau das hielt den main-e2e-Job vom 05.-11.08.
// dauerhaft rot: feststellung-flow-gate.spec.ts las einen local-only Seed top-level, und
// damit lief auf main KEIN einziger Journey-Smoke mehr (BROADCAST-main-ci-e2e-red-
// feststellung-seed-crash). Ein einzelner fehlender Seed darf niemals das ganze Netz kippen.
//
// RICHTIG (Muster: reparatur-funnel-abschluss-smoke.spec.ts / feststellung-flow-gate.spec.ts):
//   let seed = null
//   try { seed = JSON.parse(readFileSync(...)) } catch { /* nicht geseedet */ }
//   test('...', async () => { test.skip(!seed, '...'); ... })
// -> fehlt der Seed, SKIPPT der Test sauber statt die Collection zu sprengen.
//
// ERKENNUNG: Brace-Depth-Tracking. Auf Depth 0 ist Modul-Scope; innerhalb `try { … }`,
// einer Funktion oder eines test()-Bodies ist die Depth >= 1 -> nicht geflaggt. Bewusst
// simpel (kein Parser) und dadurch ohne Abhaengigkeiten.
//
// BEKANNTE GRENZE (dokumentiert, nicht versteckt): ein ueber mehrere Zeilen verteilter
// Aufruf, bei dem `readFileSync` erst nach einer oeffnenden Klammer auf einer Folgezeile
// steht (`const s = JSON.parse(\n  readFileSync(...)\n)`), wird nicht erkannt -- dort ist
// die Depth bereits > 0. Der Guard faengt die real aufgetretene Form; er ist eine
// Drift-Bremse, kein Beweis.
//
// AUSNAHME: `// e2e-toplevel-fs-skip: <grund>` irgendwo im File -> komplett uebersprungen.

const SKIP_MARKER = /\/\/\s*e2e-toplevel-fs-skip:/

// Entfernt Zeilen-Kommentar-Rest + String-INHALTE einer einzelnen Zeile, damit weder ein
// `{` in einem String noch ein `readFileSync` in einem Kommentar die Analyse verfaelscht.
function entrausche(zeile) {
  return zeile
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/.*$/, '')
}

function zaehle(str, zeichen) {
  let n = 0
  for (const c of str) if (c === zeichen) n++
  return n
}

/**
 * @param {string} src Inhalt einer *.spec.ts
 * @returns {{line: number}[]} Fundstellen (leer = sauber)
 */
export function scanContent(src) {
  if (SKIP_MARKER.test(src)) return []

  const zeilen = src.split(/\r?\n/)
  const treffer = []
  let depth = 0
  let imBlockKommentar = false

  for (let i = 0; i < zeilen.length; i++) {
    let zeile = zeilen[i]

    // Block-Kommentare zeilenweise ueberspringen (Zeilenstruktur bleibt erhalten).
    if (imBlockKommentar) {
      const ende = zeile.indexOf('*/')
      if (ende === -1) continue
      imBlockKommentar = false
      zeile = zeile.slice(ende + 2)
    }
    const start = zeile.indexOf('/*')
    if (start !== -1 && !zeile.includes('*/', start)) {
      imBlockKommentar = true
      zeile = zeile.slice(0, start)
    }

    const code = entrausche(zeile)

    // Auf Depth 0 = Modul-Scope. `try {` auf derselben Zeile ist bereits die Absicherung
    // (die oeffnende Klammer wird erst am Zeilenende verrechnet) -> nicht flaggen.
    if (depth === 0 && /\breadFileSync\s*\(/.test(code) && !/\btry\s*\{/.test(code)) {
      treffer.push({ line: i + 1 })
    }

    depth += zaehle(code, '{') - zaehle(code, '}')
    if (depth < 0) depth = 0
  }

  return treffer
}

export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((f) => !base.has(f)).sort(),
    removed: baselineFiles.filter((f) => !cur.has(f)).sort(),
  }
}
