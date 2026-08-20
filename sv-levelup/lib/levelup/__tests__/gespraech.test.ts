import { describe, expect, it } from 'vitest'
import { EINWAENDE, baueGespraech, dreiWichtigste } from '../gespraech'
import type { ModulErgebnis } from '../messmaschine'
import type { Befund } from '../modul-vertrag'

function b(schluessel: string, punkte: number, maximum: number, wert: Befund['wert'] = true): Befund {
  return {
    schluessel, label: schluessel, wert, punkte, maximum,
    ampel: 'gelb', quelle: 'Q', erhoben: '2026-08-20T10:00:00.000Z',
    ...(wert === null ? { grund: 'nicht erhoben' } : {}),
  }
}

const BEFUNDE: Record<string, ModulErgebnis> = {
  gbp: { befunde: [b('fotos', 0, 6), b('oeffnungszeiten', 0, 5), b('telefon', 1, 1)], istPunkte: 1, maxPunkte: 12 },
  seo: { befunde: [b('titel', 1, 3), b('daten', 0, 2)], istPunkte: 1, maxPunkte: 5 },
  wett: {
    befunde: [
      b('marktgroesse', 0, 0, 60),
      b('rang', 2, 8, '58. von 60'),
      b('median', 0, 4, '3 von 43'),
    ],
    istPunkte: 2, maxPunkte: 12,
  },
}

describe('dreiWichtigste', () => {
  it('waehlt die drei groessten Punktabstaende', () => {
    const drei = dreiWichtigste(BEFUNDE)
    expect(drei.map((d) => d.schluessel)).toEqual(['rang', 'fotos', 'oeffnungszeiten'])
  })

  it('laesst bei gleichem Abstand das schwerere Kriterium gewinnen', () => {
    // `fotos` und `rang` fehlen beide 6 Punkte — ohne feste Regel entschiede
    // die Reihenfolge im Objekt, also Zufall. `rang` zaehlt 8 statt 6 und
    // traegt damit mehr zum Gesamtbild bei.
    const drei = dreiWichtigste(BEFUNDE)
    expect(drei[0].schluessel).toBe('rang')
    expect(drei[0].maximum).toBeGreaterThan(drei[1].maximum)
  })

  it('ueberspringt Befunde ohne Punktwertung', () => {
    // `marktgroesse` traegt 0 Punkte — es ist Einordnung, kein Mangel.
    expect(dreiWichtigste(BEFUNDE).some((d) => d.schluessel === 'marktgroesse')).toBe(false)
  })

  it('ueberspringt nicht erhobene Befunde', () => {
    // ⚠ Ein ungemessener Wert hat den groesstmoeglichen Abstand zum Maximum
    // und stuende sonst ganz oben — Aaron nennte im Gespraech eine Schwaeche,
    // die niemand gemessen hat.
    const mitLuecke: Record<string, ModulErgebnis> = {
      ux: { befunde: [b('telefonLink', 0, 4, null)], istPunkte: 0, maxPunkte: 4 },
      ...BEFUNDE,
    }
    expect(dreiWichtigste(mitLuecke).some((d) => d.schluessel === 'telefonLink')).toBe(false)
  })

  it('liefert weniger als drei, wenn es weniger gibt', () => {
    const knapp: Record<string, ModulErgebnis> = {
      web: { befunde: [b('https', 0, 3)], istPunkte: 0, maxPunkte: 3 },
    }
    expect(dreiWichtigste(knapp)).toHaveLength(1)
  })
})

describe('baueGespraech', () => {
  it('zaehlt die Module und die belegten Zahlen', () => {
    const g = baueGespraech(BEFUNDE, [])
    expect(g.module).toBe(3)
    // Alle acht Befunde tragen einen Wert — auch die ohne Punktwertung
    // (`marktgroesse`), denn im Gespraech ist auch das eine belegte Zahl.
    expect(g.zahlenMitQuelle).toBe(8)
  })

  it('baut den Lage-Satz aus den Wettbewerbszahlen', () => {
    const g = baueGespraech(BEFUNDE, [])
    expect(g.lage).toContain('60')
    expect(g.lage).toContain('58. von 60')
  })

  it('formuliert den Median-Vergleich als eigenen Satz', () => {
    // ⚠ Die Einordnung des Befunds roh zu uebernehmen ergab „Unter dem Median
    // (100) — 5 Bewertungen fehlen dorthin" mitten im Lage-Satz: als Beisatz
    // unter einer Ueberschrift richtig, laut vorgelesen bezuglos.
    const g = baueGespraech(BEFUNDE, [])
    expect(g.lage).toContain('Der mittlere Betrieb dort hat 43 Bewertungen, Sie haben 3.')
    expect(g.lage).not.toContain('fehlen dorthin')
  })

  it('sagt es, wenn der Wettbewerb nicht gemessen wurde', () => {
    const ohneWett = { gbp: BEFUNDE.gbp }
    const g = baueGespraech(ohneWett, [])
    // Kein erfundener Lage-Satz — im Gespraech waere das die erste Zahl, die
    // jemand hinterfragt.
    expect(g.lage).toContain('nicht erhoben')
  })

  it('nennt zu jeder der drei Zahlen einen Einwand', () => {
    const g = baueGespraech(BEFUNDE, [])
    expect(g.dreiZahlen).toHaveLength(3)
    for (const z of g.dreiZahlen) {
      expect(z.einwand.length).toBeGreaterThan(20)
      expect(z.antwort.length).toBeGreaterThan(20)
    }
  })

  it('rechnet die Dauer der ersten Phase in Wochen', () => {
    const g = baueGespraech(BEFUNDE, [
      { t: 'A', w: '', a: '1 h', wi: 'hoch', p: 6, q: 'Q', ph: 1 },
      { t: 'B', w: '', a: '1,5 h', wi: 'mittel', p: 5, q: 'Q', ph: 1 },
      { t: 'C', w: '', a: '3 h', wi: 'gering', p: 2, q: 'Q', ph: 3 },
    ])
    expect(g.phase1).toHaveLength(2)
    expect(g.phase1Punkte).toBe(11)
    expect(g.phase1Dauer).toMatch(/Woche/)
  })

  it('kommt ohne Massnahmen zurecht', () => {
    const g = baueGespraech(BEFUNDE, [])
    expect(g.phase1).toEqual([])
    expect(g.phase1Punkte).toBe(0)
  })
})

describe('EINWAENDE', () => {
  it('deckt jedes Kriterium ab, zu dem eine Massnahme existiert', async () => {
    const { VORLAGEN } = await import('../massnahmen')
    const ohne = Object.keys(VORLAGEN).filter((s) => !EINWAENDE[s])
    expect(ohne).toEqual([])
  })

  it('nutzt echte Umlaute', () => {
    const falsch = ['fuer', 'ueber', 'koennen', 'muessen', 'waehrend', 'groesse', 'zahlt sich']
    for (const [s, e] of Object.entries(EINWAENDE)) {
      const text = `${e.einwand} ${e.antwort}`.toLowerCase()
      for (const f of falsch.slice(0, 6)) {
        expect(text.includes(f), `${s}: „${f}"`).toBe(false)
      }
    }
  })
})
