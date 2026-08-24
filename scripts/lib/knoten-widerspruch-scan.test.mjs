import { describe, expect, it } from 'vitest'
import { fremdeOrtsnamen, findeWiderspruecke, gattung, kern } from './knoten-widerspruch-scan.mjs'

describe('gattung', () => {
  it('erkennt beide Schreibweisen', () => {
    expect(gattung('Kreuz Bottrop')).toBe('Kreuz')
    expect(gattung('Bremer Kreuz')).toBe('Kreuz')
    expect(gattung('Autobahnkreuz Holz')).toBe('Kreuz')
    expect(gattung('Dreieck Jackerath')).toBe('Dreieck')
    expect(gattung('Autobahndreieck Karlsruhe')).toBe('Dreieck')
  })
  it('gibt null fuer Anschlussstellen', () => {
    expect(gattung('Anschlussstelle Hagen-Süd')).toBe(null)
    expect(gattung('Auffahrt A3 bei Hamminkeln')).toBe(null)
  })
})

describe('kern', () => {
  it('entfernt Gattung, Klammern und Strassennummern', () => {
    expect(kern('Autobahnkreuz Holz (A44/A46)')).toBe('holz')
    expect(kern('Kreuz Bottrop')).toBe('bottrop')
    expect(kern('Dreieck Essen-Ost')).toBe('essen-ost')
  })
  it('laesst Adjektivform und Grundform GETRENNT', () => {
    // Sonst verschmelzen „Bremer" und „Bremerhaven" — zwei verschiedene Orte
    // wuerden faelschlich zum Widerspruch erklaert.
    expect(kern('Bremer Kreuz')).not.toBe(kern('Kreuz Bremen'))
  })
})

describe('findeWiderspruecke', () => {
  it('findet denselben Knoten mit zwei Gattungen', () => {
    const t = findeWiderspruecke([
      { slug: 'essen', knoten: ['Kreuz Essen-Ost'] },
      { slug: 'bochum', knoten: ['Dreieck Essen-Ost'] },
    ])
    expect(t).toHaveLength(1)
    expect(t[0].kern).toBe('essen-ost')
    expect(t[0].varianten.map((v) => v.gattung).sort()).toEqual(['Dreieck', 'Kreuz'])
  })

  it('meldet NICHT, wenn beide Staedte dieselbe Gattung nennen', () => {
    expect(
      findeWiderspruecke([
        { slug: 'a', knoten: ['Kreuz Holz'] },
        { slug: 'b', knoten: ['Autobahnkreuz Holz'] },
      ]),
    ).toEqual([])
  })

  it('ignoriert Anschlussstellen — die tragen keine Gattung', () => {
    expect(
      findeWiderspruecke([
        { slug: 'a', knoten: ['Anschlussstelle Herne'] },
        { slug: 'b', knoten: ['Anschlussstelle Herne'] },
      ]),
    ).toEqual([])
  })

  it('faengt den Widerspruch auch INNERHALB einer Stadt', () => {
    const t = findeWiderspruecke([{ slug: 'bottrop', knoten: ['Kreuz Bottrop', 'Dreieck Bottrop'] }])
    expect(t).toHaveLength(1)
  })
})

describe('fremdeOrtsnamen', () => {
  const namen = new Map([
    ['haan', 'Haan'],
    ['hilden', 'Hilden'],
    ['arnsberg', 'Arnsberg'],
  ])

  it('meldet einen Knoten, der nach einer anderen Stadt heisst', () => {
    const t = fremdeOrtsnamen([{ slug: 'haan', knoten: ['Autobahnkreuz Hilden (A3/A46)'] }], namen)
    expect(t).toHaveLength(1)
    expect(t[0].fremd).toBe('hilden')
  })

  it('meldet NICHT, wenn der Knoten die eigene Stadt nennt', () => {
    expect(fremdeOrtsnamen([{ slug: 'hilden', knoten: ['Kreuz Hilden'] }], namen)).toEqual([])
  })

  it('meldet NICHT, wenn beide Orte im Namen stehen', () => {
    // „Kreuz Bochum/Witten" gehoert zu beiden.
    const n = new Map([['bochum', 'Bochum'], ['witten', 'Witten']])
    expect(fremdeOrtsnamen([{ slug: 'witten', knoten: ['Kreuz Bochum/Witten'] }], n)).toEqual([])
  })
})
