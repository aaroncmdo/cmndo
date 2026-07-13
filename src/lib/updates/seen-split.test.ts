import { describe, it, expect } from 'vitest'
import { splitActionItemsBySeen } from './seen-split'

const CURSOR = '2026-07-14T10:00:00.000Z'
const before = { id: 'b', timestamp: '2026-07-14T09:00:00.000Z' }
const at = { id: 'e', timestamp: CURSOR }
const after = { id: 'a', timestamp: '2026-07-14T11:00:00.000Z' }

describe('splitActionItemsBySeen — two-tier badge (unseen vs seen-open)', () => {
  it('cursor null: everything is unseen (never marked seen)', () => {
    const r = splitActionItemsBySeen([before, at, after], null)
    expect(r.unseenCount).toBe(3)
    expect(r.seenIds).toEqual([])
  })

  it('invalid cursor string is treated as null (all unseen)', () => {
    const r = splitActionItemsBySeen([before, after], 'not-a-date')
    expect(r.unseenCount).toBe(2)
  })

  it('item strictly after the cursor is unseen; at/before is seen-open', () => {
    const r = splitActionItemsBySeen([before, at, after], CURSOR)
    expect(r.unseenIds).toEqual(['a'])
    expect(r.seenIds).toEqual(['b', 'e']) // == cursor counts as seen
    expect(r.unseenCount).toBe(1)
  })

  it('empty item list -> zero counts', () => {
    const r = splitActionItemsBySeen([], CURSOR)
    expect(r).toEqual({ unseenCount: 0, unseenIds: [], seenIds: [] })
  })

  it('item with an unreadable timestamp is conservatively UNSEEN (never silently hidden)', () => {
    const r = splitActionItemsBySeen([{ id: 'x', timestamp: 'garbage' }], CURSOR)
    expect(r.unseenIds).toEqual(['x'])
    expect(r.unseenCount).toBe(1)
  })
})
