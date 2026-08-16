import { describe, it, expect } from 'vitest'
import { scanContent, stripKommentare, diffBaseline } from '../intake-funnel-scan.mjs'

describe('intake-funnel-scan — findet direkte createLead-Aufrufe', () => {
  it('flaggt einen einfachen Aufruf', () => {
    const t = scanContent(`const r = await createLead(admin, base, extra)`)
    expect(t).toHaveLength(1)
    expect(t[0].line).toBe(1)
  })

  it('meldet die richtige Zeilennummer', () => {
    const t = scanContent(['a', 'b', 'const r = await createLead(db, x)', 'c'].join('\n'))
    expect(t).toHaveLength(1)
    expect(t[0].line).toBe(3)
  })

  it('flaggt mehrere Aufrufe im selben File', () => {
    expect(scanContent(`createLead(a)\nconst x = 1\ncreateLead(b)`)).toHaveLength(2)
  })
})

describe('intake-funnel-scan — 0 False-Positives (die teuren Faelle)', () => {
  it('ein ZEILEN-Kommentar ueber createLead zaehlt NICHT', () => {
    // Genau der Fall aus public-rueckruf.ts nach der Migration: der Erklaertext nennt
    // createLead, das File ruft es aber gar nicht mehr auf.
    const quelle = [
      '// C2/§9-#5: laeuft ueber `createCase` statt roh ueber `createLead` —',
      '// dadurch gibt es einen garantierten FlowLink.',
      'const r = await createCase(admin, { mode: "lead-first", base })',
    ].join('\n')
    expect(scanContent(quelle)).toHaveLength(0)
  })

  it('ein BLOCK-Kommentar mit createLead( zaehlt NICHT', () => {
    const quelle = ['/*', ' * frueher: createLead(admin, base)', ' */', 'createCase(admin, x)'].join('\n')
    expect(scanContent(quelle)).toHaveLength(0)
  })

  it('ein Kommentar am Zeilenende hinter echtem Code zaehlt den CODE', () => {
    expect(scanContent(`await createLead(a) // TODO auf createCase heben`)).toHaveLength(1)
  })

  it('reiner Import zaehlt NICHT', () => {
    expect(scanContent(`import { createLead } from '@/lib/leads/create-lead'`)).toHaveLength(0)
  })

  it('Re-Export zaehlt NICHT', () => {
    expect(scanContent(`export { createLead } from './create-lead'`)).toHaveLength(0)
  })

  it('typeof-Referenz zaehlt NICHT', () => {
    expect(scanContent(`type F = typeof createLead`)).toHaveLength(0)
  })

  it('laengerer Bezeichner mit gleichem Praefix zaehlt NICHT', () => {
    expect(scanContent(`await createLeadIntern(a)`)).toHaveLength(0)
  })

  it('Bezeichner mit Praefix davor zaehlt NICHT', () => {
    expect(scanContent(`await helferCreateLead(a)`)).toHaveLength(0)
  })

  it('createCase allein zaehlt NICHT', () => {
    expect(scanContent(`const r = await createCase(admin, { mode: 'lead-first' })`)).toHaveLength(0)
  })

  it('Leerzeichen zwischen Name und Klammer zaehlt trotzdem', () => {
    expect(scanContent(`await createLead (a)`)).toHaveLength(1)
  })
})

describe('stripKommentare — erhaelt die Zeilenzahl', () => {
  it('mehrzeiliger Blockkommentar verschiebt keine Zeilennummern', () => {
    const quelle = ['/*', 'weg', 'weg', '*/', 'createLead(a)'].join('\n')
    expect(stripKommentare(quelle).split('\n')).toHaveLength(5)
    expect(scanContent(quelle)[0].line).toBe(5)
  })
})

describe('diffBaseline', () => {
  it('added = neu hinzugekommen, removed = behoben', () => {
    const { added, removed } = diffBaseline(['b.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(added).toEqual(['c.ts'])
    expect(removed).toEqual(['a.ts'])
  })

  it('identische Mengen -> nichts', () => {
    const { added, removed } = diffBaseline(['a.ts'], ['a.ts'])
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })
})
