// Pure Scan-Logik fuer check:anthropic-stop-reason — erzwungene Tool-Antworten,
// deren Abbruch niemand bemerkt. Keine I/O -> unit-testbar (vitest).
// CLI-Wrapper: ../check-anthropic-stop-reason.mjs
//
// DIE FEHLERKLASSE: Reisst eine Antwort das Token-Limit, liefert die Anthropic-API
// einen UNVOLLSTAENDIGEN `tool_use`-Block — kein Fehler, keine Exception. Wer den
// Block danach mit Fallbacks ausliest, macht daraus stillschweigend leere Werte:
//
//   const block = res.content.find((b) => b.type === 'tool_use')
//   return { ok: true, deltas: block.input.deltas ?? {} }   // ❌ leer statt Fehler
//
//   if (res.stop_reason === 'max_tokens') return { ok: false, … }   // ✅
//
// Belegte Vorfaelle (beide 18.08.2026):
//   * Lokalinhalt-Generator: Bei hoeherer Anforderung fielen von 436 Woertern 399
//     weg (0 FAQs, 0 Anker) — der Aufruf meldete `ok: true`. Drei Messlaeufe
//     zeigten 436 -> 37 -> 1151 Woerter; ohne Messung waere es nie aufgefallen.
//   * flow-intake/extract: `deltas: {}` + `naechste_frage: ''` bei `ok: true`.
//     Im Kundenfluss heisst das: Schadenmeldung getippt, nichts gespeichert
//     (die Route ueberspringt den Write bei leeren Deltas), keine Rueckfrage,
//     kein Fehler.
//
// ⚠ Ein groesseres `max_tokens` ist KEIN Ersatz fuer die Pruefung — es verschiebt
// nur, ab welcher Eingabe es still bricht. Genau das blieb bei der Gutachten-OCR
// (#5354) offen: dort wurde das Limit erhoeht, `stop_reason` nie geprueft.
//
// GESCANNT WIRD NUR DIE ERZWUNGENE TOOL-ANTWORT (`tool_choice`): dort ist der
// Abbruch tueckisch, weil ein halbes JSON wie "das Modell hatte nichts" aussieht.
// Freitext-Antworten brechen sichtbar mitten im Satz ab und sind bewusst NICHT
// erfasst — ein Ratchet mit Fehlalarmen blockiert die ganze Fleet und wird
// abgeschaltet.

/** Ein Treffer: Datei ruft die API mit erzwungenem Tool, prueft aber nicht. */
/**
 * @typedef {{ datei: string, zeile: number }} Fund
 */

/** Kommentare entfernen, damit eine Erklaerung ("wir pruefen stop_reason nicht,
 *  weil …") die Datei nicht faelschlich sauber aussehen laesst — und umgekehrt
 *  ein erwaehntes `tool_choice` im Fliesstext keinen Treffer erzeugt. */
export function strippeKommentare(quelle) {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((z) => z.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

/**
 * Prueft EINE Datei.
 *
 * @param {string} quelle Dateiinhalt
 * @returns {{ verletzt: boolean, zeile: number }} `zeile` = 1-indexierte Fundstelle
 *   des `tool_choice`, oder 0.
 */
export function pruefeDatei(quelle) {
  const code = strippeKommentare(quelle)

  // Ohne API-Aufruf ist die Datei nicht betroffen (z. B. reine Typ-Dateien, die
  // `tool_choice` nur im Schema erwaehnen).
  if (!/messages\.create\s*\(/.test(code)) return { verletzt: false, zeile: 0 }
  if (!/tool_choice\s*:/.test(code)) return { verletzt: false, zeile: 0 }
  if (/stop_reason/.test(code)) return { verletzt: false, zeile: 0 }

  // Zeilennummer aus dem ORIGINAL, damit der Bericht auf die echte Stelle zeigt.
  const zeilen = quelle.split('\n')
  const idx = zeilen.findIndex((z) => /tool_choice\s*:/.test(z))
  return { verletzt: true, zeile: idx >= 0 ? idx + 1 : 0 }
}

/**
 * Wertet einen ganzen Satz Dateien aus.
 *
 * @param {Array<{ pfad: string, quelle: string }>} dateien
 * @returns {Fund[]} nach Pfad sortiert
 */
export function scanneDateien(dateien) {
  const funde = []
  for (const { pfad, quelle } of dateien) {
    const r = pruefeDatei(quelle)
    if (r.verletzt) funde.push({ datei: pfad, zeile: r.zeile })
  }
  return funde.sort((a, b) => a.datei.localeCompare(b.datei))
}

/**
 * Vergleicht gegen die Baseline.
 *
 * @param {Fund[]} funde
 * @param {string[]} baseline Dateipfade
 * @returns {{ neu: Fund[], behoben: string[], bekannt: Fund[] }}
 */
export function vergleicheMitBaseline(funde, baseline) {
  const bekanntSet = new Set(baseline)
  const gefundenSet = new Set(funde.map((f) => f.datei))
  return {
    neu: funde.filter((f) => !bekanntSet.has(f.datei)),
    behoben: baseline.filter((b) => !gefundenSet.has(b)).sort(),
    bekannt: funde.filter((f) => bekanntSet.has(f.datei)),
  }
}
