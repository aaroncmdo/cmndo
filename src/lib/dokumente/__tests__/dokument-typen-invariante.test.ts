import { describe, it, expect } from 'vitest'
import { FAKTEN_REGELN } from '../pflicht-fakten'
import { PFLICHT_DOKUMENTE_MATRIX, DOKUMENT_LABELS } from '../pflicht-dokumente'
import { istBekannterDokumentTyp, FALL_DOKUMENT_TYPEN } from '../dokument-typen'

/**
 * DIE INVARIANTE: Eine Pflicht darf nur auf einen Dokument-Typ zeigen, den das System auch
 * vergeben kann. Sonst fordert sie ein Dokument an, das niemand hochladen kann — der Fall
 * gilt dauerhaft als unvollstaendig und laesst sich nicht abschliessen.
 *
 * Real passiert (28.08.2026): Die Matrix forderte `unfallbericht_polizei`, geschrieben wird
 * `polizeibericht`. Von allen Typen der Matrix existierte genau EINER. Der Reminder-Cron
 * meldete deshalb nie etwas — oder haette, einmal repariert, alles als fehlend gemeldet.
 *
 * ⭐ Dieser Test hat beim ersten Lauf ZWEI eigene, frisch geschriebene Regeln gefangen
 * (`mietwagen_rechnung`, `leasingvertrag` — beide vergibt niemand). Genau dafuer ist er da.
 */

describe('Invariante: jede Fakten-Pflicht zeigt auf einen vergebbaren Typ', () => {
  it.each(FAKTEN_REGELN.map((r) => [r.id, r.dann] as const))(
    'Regel "%s" fordert einen bekannten Typ: %s',
    (_id, typ) => {
      expect(
        istBekannterDokumentTyp(typ),
        `Typ "${typ}" steht nicht in dokument-typen.ts — niemand kann ihn hochladen. ` +
          `Erst den Typ dort eintragen UND eine Schreibstelle verdrahten, dann die Regel.`,
      ).toBe(true)
    },
  )

  it('jede Regel hat ein Label fuer die Anzeige', () => {
    for (const r of FAKTEN_REGELN) {
      expect(DOKUMENT_LABELS[r.dann], `kein Label fuer "${r.dann}"`).toBeDefined()
    }
  })
})

describe('Bestand: welche Matrix-Typen sind (noch) nicht vergebbar', () => {
  // Die Szenario-Matrix traegt historische Wunsch-Typen. Sie werden hier NICHT hart
  // geblockt (das waeren ~25 auf einen Schlag), aber die Zahl wird festgehalten: sie darf
  // nicht wachsen. Wer einen neuen Typ in die Matrix schreibt, muss ihn vergebbar machen.
  // Gemessen 28.08.2026: 31 der Matrix-Typen sind nicht vergebbar — praktisch die ganze
  // Matrix ist Wunschbild geblieben (vollmacht, personalausweis, schadenmeldung, alle
  // fotos_*, alle *_pdf, alle rechnung_*). Die Zahl ist eingefroren, nicht akzeptiert:
  // sie darf nur sinken. Wer einen Typ vergebbar macht, senkt sie hier mit.
  const AKZEPTIERTER_BESTAND = 31

  it('die Zahl unbekannter Matrix-Typen waechst nicht', () => {
    const alle = new Set<string>()
    for (const proSzenario of Object.values(PFLICHT_DOKUMENTE_MATRIX)) {
      for (const typen of Object.values(proSzenario)) for (const t of typen) alle.add(t)
    }
    const unbekannt = [...alle].filter((t) => !istBekannterDokumentTyp(t))
    expect(
      unbekannt.length,
      `Unbekannte Typen in der Matrix: ${unbekannt.join(', ')}`,
    ).toBeLessThanOrEqual(AKZEPTIERTER_BESTAND)
  })

  it('`polizeibericht` ist vergebbar — der Typ, den die Fakten-Regel nutzt', () => {
    expect(istBekannterDokumentTyp('polizeibericht')).toBe(true)
  })

  it('der alte Name `unfallbericht_polizei` ist NICHT vergebbar', () => {
    // Haette dieser Test frueher existiert, waere die Matrix nie darauf gelaufen.
    expect(istBekannterDokumentTyp('unfallbericht_polizei')).toBe(false)
  })
})

describe('Registry-Hygiene', () => {
  it('enthaelt keine Duplikate', () => {
    expect(new Set(FALL_DOKUMENT_TYPEN).size).toBe(FALL_DOKUMENT_TYPEN.length)
  })

  it('legitimiert den Platzhalter `x` NICHT', () => {
    // Im Code gibt es eine Schreibstelle mit `dokument_typ: 'x'`. Sie bleibt ein Befund,
    // kein akzeptierter Typ.
    expect(istBekannterDokumentTyp('x')).toBe(false)
  })
})
