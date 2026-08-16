// Pure Logik fuer check:intake-funnel (unit-getestet in scripts/lib/__tests__/).
//
// Gesucht: direkte `createLead(...)`-AUFRUFE ausserhalb des Intake-Funnels.
// Jeder Lead-Eintrittspunkt soll ueber `createCase` laufen — nur der garantiert den
// FlowLink (C2 §7#1, DECISIONS 2026-08-04). Ein roher createLead-Aufruf erzeugt einen
// Interessenten OHNE jeden Kunde-Kanal: bleibt die Rueckmeldung aus, hat er keinen Weg
// zurueck in seinen Vorgang.
//
// Praezision geht hier vor Vollstaendigkeit: nur echte Aufrufe zaehlen.
//  - Kommentare werden gestrippt (sonst flaggt jede Erklaerung wie „laeuft ueber createCase
//    statt createLead" ihr eigenes File — genau das passiert in public-rueckruf.ts nach der
//    Migration).
//  - Import-/Export-Zeilen zaehlen nicht (ein Import allein ruft nichts auf).
//  - Typ-Referenzen (`typeof createLead`) zaehlen nicht.

/** Entfernt //-Zeilen- und /* *\/-Blockkommentare, laesst die Zeilenzahl unveraendert. */
export function stripKommentare(quelltext) {
  const zeilen = quelltext.split('\n')
  let imBlock = false
  return zeilen
    .map((zeile) => {
      let out = ''
      let i = 0
      while (i < zeile.length) {
        if (imBlock) {
          const ende = zeile.indexOf('*/', i)
          if (ende === -1) { i = zeile.length; break }
          imBlock = false
          i = ende + 2
          continue
        }
        if (zeile.startsWith('//', i)) break // Rest der Zeile ist Kommentar
        if (zeile.startsWith('/*', i)) { imBlock = true; i += 2; continue }
        out += zeile[i]
        i++
      }
      return out
    })
    .join('\n')
}

const IMPORT_ODER_EXPORT = /^\s*(import|export)\b/
// `createLead(` als Aufruf — optional mit await/= davor, aber NICHT als Teil eines
// laengeren Bezeichners (z.B. `createLeadIntern(` soll nicht matchen).
const AUFRUF = /(?<![A-Za-z0-9_$])createLead\s*\(/

/**
 * @param {string} quelltext Datei-Inhalt
 * @returns {{ line: number, text: string }[]} Treffer mit 1-basierter Zeilennummer
 */
export function scanContent(quelltext) {
  const ohneKommentare = stripKommentare(quelltext)
  const treffer = []
  ohneKommentare.split('\n').forEach((zeile, idx) => {
    if (IMPORT_ODER_EXPORT.test(zeile)) return
    if (/\btypeof\s+createLead\b/.test(zeile)) return
    if (AUFRUF.test(zeile)) treffer.push({ line: idx + 1, text: zeile.trim().slice(0, 100) })
  })
  return treffer
}

/** Vergleicht die aktuelle Verletzer-Menge gegen die Baseline. */
export function diffBaseline(aktuell, baseline) {
  const b = new Set(baseline)
  const a = new Set(aktuell)
  return {
    added: aktuell.filter((f) => !b.has(f)).sort(),
    removed: baseline.filter((f) => !a.has(f)).sort(),
  }
}
