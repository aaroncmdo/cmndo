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
