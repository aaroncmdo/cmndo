import { describe, expect, it } from 'vitest'

import { distanzKm, naechsteStaedte } from './nachbarstaedte'
import { STAEDTE } from './staedte'

describe('distanzKm', () => {
  it('rechnet eine bekannte Strecke plausibel (Koeln -> Duesseldorf ~35 km)', () => {
    const koeln = { lat: 50.9375, lng: 6.9603 }
    const duesseldorf = { lat: 51.2277, lng: 6.7735 }
    expect(distanzKm(koeln, duesseldorf)).toBeGreaterThan(30)
    expect(distanzKm(koeln, duesseldorf)).toBeLessThan(42)
  })

  it('ist symmetrisch und auf sich selbst null', () => {
    const a = { lat: 51.5177, lng: 7.0857 }
    const b = { lat: 53.5511, lng: 9.9937 }
    expect(distanzKm(a, b)).toBe(distanzKm(b, a))
    expect(distanzKm(a, a)).toBe(0)
  })
})

describe('naechsteStaedte', () => {
  it('liefert die gewuenschte Anzahl und nie die Stadt selbst', () => {
    const n = naechsteStaedte('koeln', 6)
    expect(n).toHaveLength(6)
    expect(n.some((s) => s.slug === 'koeln')).toBe(false)
  })

  it('sortiert aufsteigend nach Entfernung', () => {
    const n = naechsteStaedte('dortmund', 8)
    const distanzen = n.map((s) => s.entfernungKm)
    expect([...distanzen].sort((a, b) => a - b)).toEqual(distanzen)
  })

  it('findet fuer Koeln echte Nachbarn statt Zufallsstaedte', () => {
    const slugs = naechsteStaedte('koeln', 6).map((s) => s.slug)
    // Leverkusen (~13 km) und Bergisch Gladbach (~16 km) muessen dabei sein.
    expect(slugs).toContain('leverkusen')
    expect(slugs).toContain('bergisch-gladbach')
    expect(slugs).not.toContain('hamburg')
  })

  // Regression fuer den konkreten Bug: die alte Auswahl (Bundesland-Filter +
  // slice(0,6) in Array-Reihenfolge) gab Berlin Nachbarn in ~475 km Schnitt,
  // weil die Liste mit den NRW-Staedten beginnt.
  it('gibt Berlin keine NRW-Staedte als Nachbarn', () => {
    const n = naechsteStaedte('berlin', 6)
    const schnitt = n.reduce((s, x) => s + x.entfernungKm, 0) / n.length
    expect(schnitt).toBeLessThan(200)
    expect(n.some((s) => ['koeln', 'duesseldorf', 'aachen'].includes(s.slug))).toBe(false)
  })

  it('haelt den Gesamtschnitt ueber alle Staedte deutlich unter dem alten Wert', () => {
    // Alt: Ø 132 km ueber alle Staedte. Neu muss klar darunter liegen.
    const alle = STAEDTE.map((s) => {
      const n = naechsteStaedte(s.slug, 6)
      return n.reduce((sum, x) => sum + x.entfernungKm, 0) / n.length
    })
    const schnitt = alle.reduce((a, b) => a + b, 0) / alle.length
    expect(schnitt).toBeLessThan(80)
  })

  it('ist deterministisch', () => {
    expect(naechsteStaedte('essen', 6).map((s) => s.slug)).toEqual(
      naechsteStaedte('essen', 6).map((s) => s.slug),
    )
  })

  it('liefert bei unbekanntem Slug ein leeres Array', () => {
    expect(naechsteStaedte('gibt-es-nicht')).toEqual([])
  })

  it('verkraftet limit 0 und negative Werte', () => {
    expect(naechsteStaedte('koeln', 0)).toEqual([])
    expect(naechsteStaedte('koeln', -3)).toEqual([])
  })
})
