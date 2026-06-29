import { describe, it, expect } from 'vitest'
import { splitUpdates, filterByTyp, routeForKontext } from '../split'
import type { UpdateItem } from '../types'

const mk = (id: string, modus: 'info' | 'action', createdAt: string, typ: UpdateItem['typ'] = 'event'): UpdateItem => ({
  id, typ, modus, prioritaet: 'normal', titel: id, inhalt: null,
  kontextTyp: null, kontextId: null, routeUrl: null, source: 's', createdAt,
})

describe('splitUpdates', () => {
  it('trennt action/info; actionCount = nur offene Actions', () => {
    const r = splitUpdates(
      [mk('a', 'action', '2026-06-29T10:00:00Z'), mk('i', 'info', '2026-06-29T09:00:00Z')],
      null,
    )
    expect(r.actionItems.map(x => x.id)).toEqual(['a'])
    expect(r.infoItems.map(x => x.id)).toEqual(['i'])
    expect(r.actionCount).toBe(1)
  })

  it('newInfoCount = Info NACH last_seen (treibt nicht den Badge)', () => {
    const items = [mk('i1', 'info', '2026-06-29T08:00:00Z'), mk('i2', 'info', '2026-06-29T12:00:00Z')]
    expect(splitUpdates(items, '2026-06-29T10:00:00Z').newInfoCount).toBe(1)
    expect(splitUpdates(items, null).newInfoCount).toBe(2)
  })
})

describe('filterByTyp', () => {
  it('alle = unveraendert, sonst nach typ', () => {
    const items = [mk('a', 'action', 'x', 'task'), mk('m', 'action', 'x', 'message')]
    expect(filterByTyp(items, 'alle')).toHaveLength(2)
    expect(filterByTyp(items, 'message').map(x => x.id)).toEqual(['m'])
  })
})

describe('routeForKontext', () => {
  it('claim-Kontext -> rollen-bewusste Fall-Route', () => {
    expect(routeForKontext('claim', 'c1', 'kunde')).toBe('/kunde/faelle/c1')
    expect(routeForKontext('claim', 'c1', 'sachverstaendiger')).toBe('/gutachter/fall/c1')
    expect(routeForKontext('claim', 'c1', 'makler')).toBe('/makler/akten/c1')
    expect(routeForKontext('claim', 'c1', 'admin')).toBe('/faelle/c1')
    expect(routeForKontext('claim', 'c1', 'dispatch')).toBe('/faelle/c1')
  })
  it('lead-Kontext + null-Faelle', () => {
    expect(routeForKontext('lead', 'l1', 'dispatch')).toBe('/dispatch/leads/l1')
    expect(routeForKontext('claim', null, 'kunde')).toBeNull()
    expect(routeForKontext(null, 'x', 'kunde')).toBeNull()
  })
})
