import { describe, it, expect } from 'vitest'
import { sortiereMitNetzwerk } from '../sortiere-mit-netzwerk'

const k = (id: string, schaden_match: boolean, partner_seit: string | null) => ({ id, schaden_match, partner_seit })

describe('sortiereMitNetzwerk (K4/13b)', () => {
  it('Netzwerkpartner zuerst — schlaegt schaden_match + partner_seit', () => {
    const out = sortiereMitNetzwerk([k('f', true, '2020-01-01'), k('n', false, '2026-01-01')], new Set(['n']))
    expect(out.map((c) => c.id)).toEqual(['n', 'f'])
  })
  it('innerhalb der Netzwerkpartner: schaden_match vor kein-Match', () => {
    const out = sortiereMitNetzwerk([k('a', false, '2020-01-01'), k('b', true, '2026-01-01')], new Set(['a', 'b']))
    expect(out.map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('gleicher Netzwerk+schaden_match: frueheres partner_seit zuerst', () => {
    const out = sortiereMitNetzwerk([k('neu', true, '2026-05-01'), k('alt', true, '2026-01-01')], new Set(['neu', 'alt']))
    expect(out.map((c) => c.id)).toEqual(['alt', 'neu'])
  })
  it('leeres Set: reine schaden_match/partner_seit-Reihung (kein Netzwerk-Effekt)', () => {
    const out = sortiereMitNetzwerk([k('a', false, '2020-01-01'), k('b', true, '2026-01-01')], new Set())
    expect(out.map((c) => c.id)).toEqual(['b', 'a'])
  })
})
