import { describe, expect, it } from 'vitest'
import { VORLAGEN } from '../massnahmen'
import { GEWICHTE as GBP } from '../module/gbp'
import { GEWICHTE as SEO } from '../module/seo'
import { GEWICHTE as UX } from '../module/ux'
import { GEWICHTE as WEB } from '../module/web'
import { GEWICHTE as WETT } from '../module/wett'

/**
 * Die Kriterien aller Module, die Punkte vergeben — nach Modul getrennt,
 * damit ein Doppelname sichtbar wird.
 */
const NACH_MODUL: Record<string, string[]> = {
  gbp: Object.keys(GBP),
  seo: Object.keys(SEO),
  ux: Object.keys(UX),
  web: Object.keys(WEB),
  wett: Object.keys(WETT),
}

/**
 * Bekannte ASCII-Ersatzformen fuer Umlaute.
 *
 * ⚠ Am 19.08. im eigenen Bestand gefunden: „geschaeftsmaessige",
 * „abmahnfaehig", „Datenschutzerklaerung" standen im Massnahmen-Plan — also
 * in einem Text, den ein Sachverstaendiger liest. Backend-Kommentare duerfen
 * ASCII sein, nutzersichtbare Texte nie (AGENTS.md).
 *
 * Bewusst eine WORTLISTE statt eines Musters wie /ue/: „aktuell", „Quelle"
 * und „Duell" tragen dieselbe Buchstabenfolge voellig zu Recht.
 */
const ASCII_ERSATZ = [
  'fuer', 'ueber', 'koennen', 'muessen', 'waehrend', 'geschaeft', 'abmahnfaehig',
  'erklaerung', 'zeitgemaess', 'laenger', 'unabhaengig', 'haengt', 'groesse',
  'buero', 'uebergabe', 'aufschliessen', 'schliessen', 'laesst', 'verschluesselung',
  'mobilgeraete', 'fussbereich', 'gehoert', 'oeffnungszeiten', 'genuegen',
  'haeufiger', 'aussenansicht', 'staerker', 'ueberschrift', 'oertlich',
  'ergaenzen', 'anhaenger', 'zurueck', 'moeglich', 'naechste', 'spaeter',
]

describe('Massnahmen-Vorlagen', () => {
  it('nutzen echte Umlaute, keinen ASCII-Ersatz', () => {
    const treffer: string[] = []
    for (const [schluessel, v] of Object.entries(VORLAGEN)) {
      const text = `${v.t} ${v.w}`.toLowerCase()
      for (const falsch of ASCII_ERSATZ) {
        if (text.includes(falsch)) treffer.push(`${schluessel}: „${falsch}"`)
      }
    }
    expect(treffer).toEqual([])
  })

  it('haben keine kollidierenden Schluessel zwischen den Modulen', () => {
    // ⚠ `VORLAGEN` ist ein flacher Record ueber den Befund-Schluessel. Nutzten
    // zwei Module denselben Schluessel, bekaeme das eine die Massnahme des
    // anderen — ohne dass irgendetwas rot wuerde.
    const gesehen = new Map<string, string>()
    const kollisionen: string[] = []
    for (const [modul, schluessel] of Object.entries(NACH_MODUL)) {
      for (const s of schluessel) {
        const vorher = gesehen.get(s)
        if (vorher) kollisionen.push(`„${s}" in ${vorher} und ${modul}`)
        else gesehen.set(s, modul)
      }
    }
    expect(kollisionen).toEqual([])
  })

  it('decken jedes punktetragende Kriterium der gebauten Module ab', () => {
    const ohne: string[] = []
    for (const [modul, schluessel] of Object.entries(NACH_MODUL)) {
      for (const s of schluessel) {
        if (!VORLAGEN[s]) ohne.push(`${modul}.${s}`)
      }
    }
    // Ein Kriterium ohne Vorlage erzeugt bewusst keine Massnahme — aber dann
    // findet der Check etwas, wozu er nichts zu sagen weiss. Das soll auffallen.
    expect(ohne).toEqual([])
  })

  it('nennen bei jeder Vorlage, was zu tun ist und warum es wirkt', () => {
    for (const [schluessel, v] of Object.entries(VORLAGEN)) {
      expect(v.t.length, `${schluessel}: Titel`).toBeGreaterThan(10)
      expect(v.w.length, `${schluessel}: Begruendung`).toBeGreaterThan(60)
      expect(v.minuten, `${schluessel}: Aufwand`).toBeGreaterThan(0)
    }
  })
})
