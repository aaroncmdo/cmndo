// Pure Scan-/Diff-Logik fuer die Stumme-Waechter-Drift-Bremse.
// Keine I/O, kein git -> unit-testbar. CLI-Wrapper: ../check-stumme-waechter.mjs
//
// WARUM: Ein Playwright-Test hinter `test.skip(!process.env.RUN_X, …)` laeuft nur, wenn
// jemand `RUN_X` setzt. Wird der Schalter in KEINEM Workflow gesetzt, meldet sich der
// Waechter nie — und faellt trotzdem niemandem auf, weil er als **skipped** zaehlt, nicht
// als failed. Ein stummer Waechter ist schlimmer als keiner: er steht in der Spec-Liste
// und suggeriert Abdeckung.
//
// GEMESSEN 31.08.2026 im nightly: 4 failed, 165 passed — und **88 skipped**. Dahinter
// standen 11 Waechter fuer zentrale Flows (golden-path-completion, 2fa-hardening,
// trusted-device, kundenfunnel-szenarien, quali-gutachter-bindung-c1, …), deren Schalter
// in `ci.yml` nie vorkam. Bei zweien war die Lage sogar schlimmer als „Schalter vergessen":
// ihre Zugangsdaten (`SMOKE_2FA_*`) existierten NIRGENDS, und der Fixture-Claim des
// Golden-Path-Tests war geloescht. Details: memory/AUDIT-nightly-nur-fehler-react418-…
//
// ERKENNUNG (bewusst hoch-praezise, ~0 False-Positives):
//   * nur `process.env.<NAME>`-Referenzen, deren NAME mit `RUN_` beginnt — das ist die
//     etablierte Konvention fuer Opt-in-Schalter in diesem Repo (23 Stueck).
//   * ein Schalter MIT Fallback (`process.env.X ?? 'wert'` / `|| 'wert'`) zaehlt NIE als
//     stumm: der Test laeuft dann auch ohne gesetzte Variable. Genau daran unterscheiden
//     sich die harmlosen `TEST_*_PASSWORD` (alle mit Fallback) von den echten Gates.
//
// ⚠ WORTGRENZE ist Pflicht beim Abgleich gegen die Workflows. `RUN_CMM65_SMOKE` enthaelt
// `RUN_CMM`; ein Teilstring-Vergleich meldet den Schalter faelschlich als gesetzt. (Beim
// ersten Zaehlen genau so passiert — der Regex `RUN_[A-Z_]+` bricht zudem an ZIFFERN ab.)
//
// AUSNAHME: `// stumme-waechter-skip: <grund>` irgendwo im File -> komplett uebersprungen.
//
// ---------------------------------------------------------------------------------------------
// ACHSE 2 (05.09.2026): Pruefskript ohne Aufrufer.
//
// WARUM: `scripts/check-copy-lint.mjs` existierte seit #5862 mit Baseline-Logik und Unit-Tests
// — und wurde von KEINEM Workflow aufgerufen (kein npm-Key, kein Step). Ein nicht aufgerufenes
// Skript erzeugt keinen roten Lauf, also merkt es niemand: dieselbe Klasse wie der RUN_-Schalter,
// nur ohne Schalter. Die Abnahme-Session zaehlte auf staging 43 Skripte gegen 19 Workflows: ohne
// Aufrufer waren copy-lint, check-server-actions.mjs (npm-Key, kein Step) und
// check-console-errors.mjs (Debug-Werkzeug). ⚠ Ihr erster Zaehler suchte nur nach npm-Keys und
// meldete die Sicherheits-Ratchets faelschlich als unverdrahtet — die Workflows rufen sie per
// DATEINAME (`node scripts/check-anon-exposure.mjs`). Beide Aufrufformen zaehlen.
//
// ERKENNUNG:
//   * Ein Skript ist aufgerufen, wenn ein Workflow seinen Dateinamen nennt (wortgenau, mit
//     Endung — `check-rls.mjs` trifft nicht in `check-rls-policies.mjs`) ODER einen npm-Key
//     aufruft (`npm run <key>`, wortgenau — `check:rls` trifft nicht `check:rls-policies`),
//     dessen Kommando den Dateinamen nennt. npm-Keys, die andere npm-Keys aufrufen, werden
//     transitiv aufgeloest.
//   * YAML-Kommentare zaehlen NICHT: `# Siehe scripts/check-x.mjs` ist Doku, kein Aufruf.
//   * Allowlist mit Grund fuer bewusst manuelle Werkzeuge lebt im CLI-Wrapper.

const SKIP_MARKER = /\/\/\s*stumme-waechter-skip:/

// Ziffern MUESSEN in die Klasse — sonst wird aus RUN_CMM65_SMOKE ein RUN_CMM.
const SCHALTER = /process\.env\.(RUN_[A-Z0-9_]+)/g

/** Alle RUN_*-Schalter eines Specs, die KEINEN Fallback haben. */
export function findeSchalter(inhalt) {
  if (SKIP_MARKER.test(inhalt)) return []
  const gefunden = new Set()
  for (const m of inhalt.matchAll(SCHALTER)) gefunden.add(m[1])
  return [...gefunden].filter((name) => !hatFallback(inhalt, name))
}

/** `process.env.X ?? 'y'` bzw. `|| 'y'` -> der Test laeuft auch ohne gesetzte Variable. */
export function hatFallback(inhalt, name) {
  return new RegExp(`process\\.env\\.${name}\\s*(\\?\\?|\\|\\|)`).test(inhalt)
}

/** Wird der Schalter in einem der Workflow-Inhalte gesetzt? Wortgenau, nicht als Teilstring. */
export function wirdGesetzt(name, workflowInhalte) {
  const wort = new RegExp(`\\b${name}\\b`)
  return workflowInhalte.some((inhalt) => wort.test(inhalt))
}

/**
 * @param {Array<{datei: string, inhalt: string}>} specs
 * @param {string[]} workflowInhalte
 * @returns {Array<{datei: string, schalter: string}>} stumme Waechter, sortiert
 */
export function scanne(specs, workflowInhalte) {
  const treffer = []
  for (const { datei, inhalt } of specs) {
    for (const schalter of findeSchalter(inhalt)) {
      if (!wirdGesetzt(schalter, workflowInhalte)) treffer.push({ datei, schalter })
    }
  }
  return treffer.sort((a, b) => (a.datei + a.schalter).localeCompare(b.datei + b.schalter))
}

/** Neue Verstoesse gegenueber der Baseline (Schluessel: "datei::schalter"). */
export function diffBaseline(treffer, baseline) {
  const bekannt = new Set(baseline)
  return treffer.map(schluessel).filter((k) => !bekannt.has(k))
}

export function schluessel(t) {
  return `${t.datei}::${t.schalter}`
}

// ---------------------------------------------------------------------------------------------
// Achse 2: Pruefskript ohne Aufrufer

/** Marker in `schalter`, damit Baseline/diff dieselben Funktionen nutzen wie Achse 1. */
export const KEIN_AUFRUFER = 'KEIN_AUFRUFER'

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** YAML-/Shell-Kommentare (`#` am Zeilenanfang oder nach Leerraum) bis Zeilenende entfernen. */
export function ohneKommentare(inhalt) {
  return inhalt
    .split('\n')
    .map((zeile) => zeile.replace(/(^|\s)#.*$/, '$1'))
    .join('\n')
}

/** Nennt der Text den Dateinamen wortgenau? `check-x.mjs` trifft nicht in `check-x-y.mjs`. */
export function nenntDatei(basisname, text) {
  return new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegex(basisname)}(?![A-Za-z0-9_-])`).test(text)
}

/** Ruft der Text den npm-Key auf? `npm run check:x [-- …]`, auch `npm run --silent check:x`; nicht `check:x-y`. */
export function ruftNpmKey(key, text) {
  return new RegExp(`npm run(?:\\s+--?[A-Za-z-]+)*\\s+${escapeRegex(key)}(?![A-Za-z0-9_:.-])`).test(text)
}

/** npm-Keys, die in den Texten aufgerufen werden — plus transitiv ueber ihre eigenen Kommandos. */
export function erreichbareNpmKeys(npmScripts, texte) {
  const alle = Object.keys(npmScripts)
  const erreicht = new Set()
  const offen = []
  for (const key of alle) {
    if (texte.some((t) => ruftNpmKey(key, t))) {
      erreicht.add(key)
      offen.push(key)
    }
  }
  while (offen.length) {
    const k = offen.shift()
    for (const key of alle) {
      if (!erreicht.has(key) && ruftNpmKey(key, npmScripts[k] ?? '')) {
        erreicht.add(key)
        offen.push(key)
      }
    }
  }
  return erreicht
}

/**
 * @param {string[]} skripte  Pfade wie 'scripts/check-x.mjs'
 * @param {Record<string, string>} npmScripts  package.json "scripts"
 * @param {string[]} workflowInhalte
 * @param {Record<string, string>} allowlist  Pfad -> Grund (bewusst manuell)
 * @returns {Array<{datei: string, schalter: string}>} Skripte ohne Aufrufer, sortiert
 */
export function skripteOhneAufrufer(skripte, npmScripts, workflowInhalte, allowlist = {}) {
  const texte = workflowInhalte.map(ohneKommentare)
  const erreicht = [...erreichbareNpmKeys(npmScripts, texte)]
  const treffer = []
  for (const datei of skripte) {
    if (allowlist[datei]) continue
    const basis = datei.split('/').pop()
    const direkt = texte.some((t) => nenntDatei(basis, t))
    const ueberNpm = erreicht.some((k) => nenntDatei(basis, npmScripts[k] ?? ''))
    if (!direkt && !ueberNpm) treffer.push({ datei, schalter: KEIN_AUFRUFER })
  }
  return treffer.sort((a, b) => a.datei.localeCompare(b.datei))
}
