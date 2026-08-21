import { describe, expect, it } from 'vitest'
import {
  PRO_SEITE,
  bereinigeSuche,
  filterUrl,
  leseFilter,
  seitenAnzahl,
  seitenBereich,
  sortierSpalte,
  suchAusdruck,
  type SvLeadFilter,
} from '../liste-filter'

describe('bereinigeSuche', () => {
  it('entfernt die Zeichen, die den PostgREST-Ausdruck zerlegen', () => {
    // ⚠ Ein Komma trennt in `or()` zwei Bedingungen. „Meyer, Schulz (GbR)"
    // erzeugte sonst keinen Treffer, sondern einen Syntaxfehler — und die Liste
    // bliebe leer, ohne dass jemand sähe, warum.
    expect(bereinigeSuche('Meyer, Schulz (GbR)')).toBe('Meyer Schulz GbR')
    expect(bereinigeSuche('a"b\\c*d%e')).toBe('a b c d e')
  })

  it('laesst Umlaute und Bindestriche unangetastet', () => {
    expect(bereinigeSuche('Sachverständigenbüro Groß-Gerau')).toBe('Sachverständigenbüro Groß-Gerau')
  })

  it('deckelt die Laenge', () => {
    expect(bereinigeSuche('x'.repeat(200))).toHaveLength(80)
  })
})

describe('suchAusdruck', () => {
  it('sucht ueber Firma, Name, Ort und Postleitzahl', () => {
    const a = suchAusdruck('Münster')!
    expect(a).toContain('firma.ilike.%Münster%')
    expect(a).toContain('ort.ilike.%Münster%')
    expect(a).toContain('plz.ilike.%Münster%')
    expect(a.split(',')).toHaveLength(4)
  })

  it('liefert null statt eines Musters, das ALLES trifft', () => {
    // ⚠ `%%` traefe jede Zeile und saehe aus wie „die Suche wirkt nicht".
    expect(suchAusdruck('')).toBeNull()
    expect(suchAusdruck('  ')).toBeNull()
    expect(suchAusdruck('a')).toBeNull()
    expect(suchAusdruck(',,,')).toBeNull()
  })
})

describe('seitenBereich', () => {
  it('rechnet die erste Seite', () => {
    expect(seitenBereich(1, 4644)).toEqual({ von: 0, bis: PRO_SEITE - 1, seite: 1 })
  })

  it('rechnet eine mittlere Seite', () => {
    const r = seitenBereich(3, 4644)
    expect(r.von).toBe(2 * PRO_SEITE)
    expect(r.bis).toBe(3 * PRO_SEITE - 1)
  })

  it('KLEMMT eine zu hohe Seite auf die letzte', () => {
    // ⚠ Ohne das liefert `?seite=999` eine leere Tabelle, die wie „keine
    // Treffer" aussieht — und der Filter bekommt die Schuld.
    const letzte = seitenAnzahl(120)
    expect(seitenBereich(999, 120).seite).toBe(letzte)
  })

  it('faengt Seite 0 und negative Seiten ab', () => {
    expect(seitenBereich(0, 120).seite).toBe(1)
    expect(seitenBereich(-5, 120).seite).toBe(1)
  })

  it('bleibt bei leerem Ergebnis auf Seite 1', () => {
    expect(seitenBereich(1, 0)).toEqual({ von: 0, bis: PRO_SEITE - 1, seite: 1 })
    expect(seitenAnzahl(0)).toBe(1)
  })
})

describe('sortierSpalte', () => {
  it('sortiert den Score AUFSTEIGEND — der niedrigste ist der groesste Nachholbedarf', () => {
    // ⭐ Absteigend zeigte die Vorbildlichen zuerst. Der Vertrieb sucht das
    // Gegenteil.
    expect(sortierSpalte('score')).toEqual({ spalte: 'levelup_letzter_score', aufsteigend: true })
  })

  it('faellt auf zuletzt geaendert zurueck', () => {
    expect(sortierSpalte('aktualisiert').spalte).toBe('aktualisiert_am')
    expect(sortierSpalte('aktualisiert').aufsteigend).toBe(false)
  })
})

describe('leseFilter', () => {
  it('nimmt die Vorgaben, wenn nichts in der URL steht', () => {
    expect(leseFilter({})).toEqual({
      suche: '', bestand: 'alle', status: null, sortierung: 'aktualisiert', seite: 1,
    })
  })

  it('verwirft unbekannte Werte, statt damit zu filtern', () => {
    const f = leseFilter({ bestand: 'irgendwas', sortierung: 'egal', seite: 'zwei' })
    expect(f.bestand).toBe('alle')
    expect(f.sortierung).toBe('aktualisiert')
    expect(f.seite).toBe(1)
  })

  it('liest einen vollstaendigen Filter', () => {
    const f = leseFilter({ suche: 'Münster', bestand: 'entdeckt', status: 'offen', sortierung: 'score', seite: '4' })
    expect(f).toEqual({ suche: 'Münster', bestand: 'entdeckt', status: 'offen', sortierung: 'score', seite: 4 })
  })

  it('bereinigt den Suchbegriff schon beim Lesen', () => {
    expect(leseFilter({ suche: 'Meyer, (GbR)' }).suche).toBe('Meyer GbR')
  })

  it('nimmt bei mehrfach gesetztem Parameter den ersten', () => {
    expect(leseFilter({ bestand: ['entdeckt', 'gepflegt'] }).bestand).toBe('entdeckt')
  })
})

describe('filterUrl', () => {
  const basis: SvLeadFilter = {
    suche: 'Münster', bestand: 'entdeckt', status: null, sortierung: 'score', seite: 3,
  }

  it('setzt jede Aenderung ausser dem Blaettern auf Seite 1 zurueck', () => {
    // ⚠ Seite 7 eines anderen Filters ist selten die gemeinte Seite und oft leer.
    expect(filterUrl(basis, { bestand: 'gepflegt' })).not.toContain('seite=')
    expect(filterUrl(basis, { seite: 5 })).toContain('seite=5')
  })

  it('behaelt die uebrigen Werte beim Blaettern', () => {
    const u = filterUrl(basis, { seite: 5 })
    expect(u).toContain('suche=M%C3%BCnster')
    expect(u).toContain('bestand=entdeckt')
    expect(u).toContain('sortierung=score')
  })

  it('laesst Vorgabewerte aus der URL weg', () => {
    const u = filterUrl(basis, { suche: '', bestand: 'alle', sortierung: 'aktualisiert' })
    expect(u).toBe('?')
  })
})
