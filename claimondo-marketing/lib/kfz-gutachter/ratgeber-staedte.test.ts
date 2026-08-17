import { describe, expect, it } from 'vitest'
import { RATGEBER_SEITEN, staedteFuerRatgeber } from './ratgeber-staedte'
import { STAEDTE } from './staedte'

describe('staedteFuerRatgeber', () => {
  it('liefert die gewuenschte Anzahl', () => {
    expect(staedteFuerRatgeber('kosten', 8)).toHaveLength(8)
    expect(staedteFuerRatgeber('kosten', 3)).toHaveLength(3)
  })

  it('ist deterministisch', () => {
    // Wackelt die Auswahl zwischen zwei Renders, aendert sich das interne
    // Linknetz bei jedem Deploy — und keine Messung waere reproduzierbar.
    expect(staedteFuerRatgeber('wertminderung', 8).map((s) => s.slug)).toEqual(
      staedteFuerRatgeber('wertminderung', 8).map((s) => s.slug),
    )
  })

  it('liefert je Artikel eine ANDERE Auswahl', () => {
    // Zeigten alle Ratgeber dieselben Staedte, waere das eine globale Kante
    // ohne thematisches Signal — genau wie der Footer-Strip.
    const a = staedteFuerRatgeber('kosten', 8).map((s) => s.slug)
    const b = staedteFuerRatgeber('wertminderung', 8).map((s) => s.slug)
    const c = staedteFuerRatgeber('ablauf', 8).map((s) => s.slug)
    expect(a).not.toEqual(b)
    expect(b).not.toEqual(c)
    expect(a).not.toEqual(c)
  })

  it('wiederholt innerhalb einer Auswahl keine Stadt', () => {
    for (const seite of RATGEBER_SEITEN) {
      const slugs = staedteFuerRatgeber(seite, 8).map((s) => s.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
    }
  })

  it('verteilt ueber alle Ratgeber-Seiten breit statt immer dieselben zu zeigen', () => {
    const alle = RATGEBER_SEITEN.flatMap((s) => staedteFuerRatgeber(s, 8).map((x) => x.slug))
    const verschieden = new Set(alle).size
    // 9 Seiten x 8 Staedte = 72 Plaetze; gemessen deckt der Index-Versatz davon
    // 71 verschiedene Staedte ab. Die Schwelle steht dicht darunter, damit ein
    // Rueckschritt auf eine schlechtere Streuung (Hash-Versatz kam nur auf 52)
    // sofort auffaellt.
    expect(verschieden).toBeGreaterThan(65)
  })

  it('zeigt auf jeder Seite mindestens eine der groessten Staedte', () => {
    // Reiner Zufall koennte eine Seite mit lauter Kleinstaedten fuellen — fuer
    // den Leser waere die Liste dann wertlos.
    const gross = new Set(
      [...STAEDTE]
        .sort((a, b) => einwohner(b) - einwohner(a))
        .slice(0, 20)
        .map((s) => s.slug),
    )
    for (const seite of RATGEBER_SEITEN) {
      const slugs = staedteFuerRatgeber(seite, 8).map((s) => s.slug)
      expect(slugs.some((s) => gross.has(s))).toBe(true)
    }
  })

  it('liefert nur existierende Staedte', () => {
    const bekannt = new Set(STAEDTE.map((s) => s.slug))
    for (const seite of RATGEBER_SEITEN) {
      for (const s of staedteFuerRatgeber(seite, 8)) expect(bekannt.has(s.slug)).toBe(true)
    }
  })

  it('vertraegt Randwerte', () => {
    expect(staedteFuerRatgeber('kosten', 0)).toEqual([])
    expect(staedteFuerRatgeber('kosten', -1)).toEqual([])
    expect(staedteFuerRatgeber('kosten', 999).length).toBe(STAEDTE.length)
    expect(staedteFuerRatgeber('', 8)).toHaveLength(8)
  })
})

describe('RATGEBER_SEITEN', () => {
  it('listet die Ratgeber-Geschwister unter /kfz-gutachter/', () => {
    expect(RATGEBER_SEITEN).toContain('kosten')
    expect(RATGEBER_SEITEN).toContain('ablauf')
    expect(RATGEBER_SEITEN).toContain('wertminderung')
    expect(RATGEBER_SEITEN.length).toBeGreaterThanOrEqual(9)
  })

  it('enthaelt keinen Stadt-Slug', () => {
    // Sonst zeigte eine Ratgeber-Liste auf eine Stadtseite und die Zaehlung
    // im Linknetz-Skript liefe auseinander.
    const staedte = new Set(STAEDTE.map((s) => s.slug))
    expect(RATGEBER_SEITEN.filter((r) => staedte.has(r))).toEqual([])
  })
})

/** Einwohnerzahl aus dem Anzeigestring — nur fuer die Testauswertung. */
function einwohner(s: { bevoelkerung: string }): number {
  const m = s.bevoelkerung.match(/^\s*([\d.,]+)\s*(Tsd|Mio)/)
  if (!m) return 0
  return Number.parseFloat(m[1].replace(',', '.')) * (m[2] === 'Mio' ? 1_000_000 : 1_000)
}
