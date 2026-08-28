import { describe, it, expect } from 'vitest'
import { getPflichtDokumenteFuerFall, PFLICHT_DOKUMENTE_MATRIX } from '../pflicht-dokumente'
import { pflichtAusFakten, FAKTEN_REGELN } from '../pflicht-fakten'

/**
 * Diese Tests halten die zwei Luecken fest, die am 28.08.2026 auf prod gemessen wurden:
 *  - 63 von 80 Claims trugen `szenario='normalfall'` — ein Wert, den die Matrix nicht kannte.
 *  - Die Matrix forderte `unfallbericht_polizei`; real heisst der Typ `polizeibericht`.
 * Beides zusammen: der Reminder-Cron hat NIE einen Task erzeugt.
 */

describe('normalfall — der real haeufigste Wert', () => {
  it('fordert ab der Aufnahme den Fahrzeugschein (war vorher LEER)', () => {
    // Fachliche Untergrenze: ohne ZB1 kein Gutachten. Eingefuehrt zu einem Zeitpunkt, an
    // dem prod KEINEN echten Kundenfall traegt — die Regel trifft heute niemanden und ist
    // scharf, sobald der erste echte Fall kommt.
    expect(getPflichtDokumenteFuerFall('aufnahme', 'normalfall').map((d) => d.typ))
      .toEqual(['fahrzeugschein'])
  })

  it('gilt ebenso fuer ruegefall und klagefall', () => {
    for (const sz of ['ruegefall', 'klagefall']) {
      expect(getPflichtDokumenteFuerFall('aufnahme', sz).map((d) => d.typ)).toEqual(['fahrzeugschein'])
    }
  })

  it('kombiniert Szenario-Pflicht und Fakten-Pflicht', () => {
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'normalfall', { polizei_vor_ort: true })
    expect(docs.map((d) => d.typ).sort()).toEqual(['fahrzeugschein', 'polizeibericht'])
  })

  it('in der lead-Phase gilt die Aufnahme-Pflicht noch NICHT', () => {
    // Kumulierend bis zur aktuellen Phase: wer noch nicht in der Aufnahme ist, wird nicht
    // nach dem Fahrzeugschein gefragt.
    expect(getPflichtDokumenteFuerFall('lead', 'normalfall')).toEqual([])
  })

  it('fordert fuer normalfall NICHT die nie existierenden Typen', () => {
    // Eine Pflicht auf einen Typ, den niemand vergibt, meldet dauerhaft "fehlt".
    const typen = getPflichtDokumenteFuerFall('abrechnung', 'normalfall').map((d) => d.typ)
    expect(typen).not.toContain('vollmacht')
    expect(typen).not.toContain('personalausweis')
    expect(typen).not.toContain('versicherungsschein_eigener')
  })
})

describe('Vokabular', () => {
  it('nutzt den real vergebenen Typ `polizeibericht`', () => {
    const alle = Object.values(PFLICHT_DOKUMENTE_MATRIX).flatMap((s) => Object.values(s).flat())
    expect(alle).toContain('polizeibericht')
    expect(alle).not.toContain('unfallbericht_polizei')
  })
})

describe('Fakten loesen Pflichten aus (Aaron 28.08.)', () => {
  it('Polizei war vor Ort -> Polizeibericht ist Pflicht', () => {
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'normalfall', { polizei_vor_ort: true })
    const bericht = docs.find((d) => d.typ === 'polizeibericht')
    expect(bericht).toBeDefined()
    expect(bericht?.grund).toMatch(/Polizei/i)
  })

  it('Polizei NICHT vor Ort -> kein Bericht gefordert', () => {
    for (const wert of [false, null, undefined]) {
      const docs = getPflichtDokumenteFuerFall('aufnahme', 'normalfall', { polizei_vor_ort: wert })
      expect(docs.map((d) => d.typ)).not.toContain('polizeibericht')
    }
  })

  it('ein Fakt OHNE vergebbaren Ziel-Typ loest KEINE Pflicht aus', () => {
    // Die urspruengliche Mietwagen-Regel forderte `mietwagen_rechnung` — einen Typ, den
    // niemand vergibt. Der Invarianten-Test (dokument-typen-invariante) hat sie gefangen,
    // die Regel ist entfernt. Der Mietwagen-Beleg laeuft ueber claims.mietwagen_rechnung_url.
    // Geprueft wird die ABWESENHEIT des Typs — die Szenario-Pflicht bleibt davon unberuehrt.
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'normalfall', { hat_mietwagen: true })
    expect(docs.map((d) => d.typ)).not.toContain('mietwagen_rechnung')
  })

  it('jede Fakten-Pflicht traegt eine Begruendung', () => {
    // Eine Forderung ohne Begruendung wirkt willkuerlich und wird weggeklickt.
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'normalfall', {
      polizei_vor_ort: true, hat_mietwagen: true,
    })
    for (const d of docs.filter((x) => x.grund !== undefined)) {
      expect(d.grund!.length).toBeGreaterThan(20)
    }
  })

  it('dedupliziert, wenn Matrix UND Fakt dasselbe Dokument fordern', () => {
    // haftpflicht_strittig fordert polizeibericht bereits ueber die Matrix.
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'haftpflicht_strittig', { polizei_vor_ort: true })
    expect(docs.filter((d) => d.typ === 'polizeibericht')).toHaveLength(1)
  })
})

describe('Rueckwaertskompatibilitaet', () => {
  it('ohne fakten verhaelt sich die Funktion wie zuvor', () => {
    const ohne = getPflichtDokumenteFuerFall('aufnahme', 'kasko')
    expect(ohne.map((d) => d.typ)).toEqual(['fahrzeugschein'])
  })

  it('unbekanntes Szenario ohne Fakten bleibt leer', () => {
    expect(getPflichtDokumenteFuerFall('aufnahme', 'gibt-es-nicht')).toEqual([])
  })

  it('unbekanntes Szenario MIT Fakt liefert trotzdem die Fakten-Pflicht', () => {
    // Genau der Fall, an dem die 63 normalfall-Claims durchfielen.
    const docs = getPflichtDokumenteFuerFall('aufnahme', 'gibt-es-nicht', { polizei_vor_ort: true })
    expect(docs.map((d) => d.typ)).toEqual(['polizeibericht'])
  })
})

describe('pflichtAusFakten — pure Regel-Ebene', () => {
  it('gibt bei leeren Fakten nichts zurueck', () => {
    expect(pflichtAusFakten(null)).toEqual([])
    expect(pflichtAusFakten({})).toEqual([])
  })

  it('jede Regel hat eine eindeutige id und einen Ziel-Typ', () => {
    const ids = FAKTEN_REGELN.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of FAKTEN_REGELN) expect(r.dann.length).toBeGreaterThan(0)
  })
})
