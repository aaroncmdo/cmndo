import { describe, it, expect } from 'vitest'
import { splitUpdates } from './split'
import type { UpdateItem } from './types'

function action(id: string, createdAt: string): UpdateItem {
  return {
    id, typ: 'task', modus: 'action', prioritaet: 'normal', titel: id,
    inhalt: null, kontextTyp: null, kontextId: null, routeUrl: null, source: 's', createdAt,
  }
}
function info(id: string, createdAt: string): UpdateItem {
  return { ...action(id, createdAt), modus: 'info', typ: 'event' }
}

describe('splitUpdates — A2 two-tier action count', () => {
  const items = [
    action('a-old', '2026-07-14T08:00:00.000Z'),
    action('a-new', '2026-07-14T12:00:00.000Z'),
    info('i1', '2026-07-14T09:00:00.000Z'),
  ]

  it('backward-compatible: no actionsLastSeen -> all actions count (Alt-Verhalten)', () => {
    const r = splitUpdates(items, null)
    expect(r.actionCount).toBe(2)
    expect(r.seenActionIds.size).toBe(0)
  })

  it('with actionsLastSeen: only UNSEEN actions drive the red count; seen-open -> seenActionIds (grau)', () => {
    const r = splitUpdates(items, null, '2026-07-14T10:00:00.000Z')
    expect(r.actionCount).toBe(1) // only a-new is after the cursor
    expect(r.seenActionIds.has('a-old')).toBe(true)
    expect(r.seenActionIds.has('a-new')).toBe(false)
  })

  it('newInfoCount stays driven by the info lastSeen, not the action cursor', () => {
    const r = splitUpdates(items, '2026-07-14T08:30:00.000Z', '2026-07-14T10:00:00.000Z')
    expect(r.newInfoCount).toBe(1) // i1 at 09:00 is after 08:30
  })
})
