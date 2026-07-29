import { describe, it, expect } from 'vitest'
import { applyNetzwerkPraeferenz } from '../apply-netzwerk-praeferenz'

type K = { id: string; qualifiziert: boolean; d: number }
const k = (id: string, qualifiziert: boolean, d: number): K => ({ id, qualifiziert, d })

describe('applyNetzwerkPraeferenz (pure Partition)', () => {
  it('leeres Freund-Set = No-op (Referenz unveraendert durchgereicht)', () => {
    const arr = [k('a', true, 1), k('b', true, 2)]
    expect(applyNetzwerkPraeferenz(arr, new Set())).toBe(arr)
  })
  it('1 qualifizierter Freund wandert nach oben + traegt imNetzwerk=true', () => {
    const out = applyNetzwerkPraeferenz([k('a', true, 1), k('b', true, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
    expect(out[0].imNetzwerk).toBe(true)
    expect(out[1].imNetzwerk).toBeUndefined()
  })
  it('mehrere Freunde: stabile Reihenfolge in beiden Gruppen', () => {
    const out = applyNetzwerkPraeferenz(
      [k('a', true, 1), k('b', true, 2), k('c', true, 3), k('d', true, 4)],
      new Set(['b', 'd']),
    )
    expect(out.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
  })
  it('unqualifizierter Freund bleibt unten (Engine-qualifiziert schlaegt Freundschaft)', () => {
    const out = applyNetzwerkPraeferenz([k('a', true, 1), k('b', false, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['a', 'b'])
    expect(out[1].imNetzwerk).toBeUndefined()
  })
  it('Owner-als-Kandidat: nicht im Freund-Set -> nicht geboostet', () => {
    const out = applyNetzwerkPraeferenz([k('owner', true, 1), k('b', true, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['b', 'owner'])
  })
})
