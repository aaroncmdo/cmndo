import { describe, it, expect } from 'vitest'
import { gruppiereNachrichtenNachTag } from '../thread-chat-format'

const JETZT = '2026-07-08T12:00:00Z'

describe('gruppiereNachrichtenNachTag', () => {
  it('leere Liste -> []', () => {
    expect(gruppiereNachrichtenNachTag([], JETZT)).toEqual([])
  })

  it('gruppiert aufeinanderfolgende Nachrichten nach Tag + labelt Heute/Gestern', () => {
    const n = [
      { id: '1', created_at: '2026-07-06T10:00:00Z' },
      { id: '2', created_at: '2026-07-07T09:00:00Z' },
      { id: '3', created_at: '2026-07-07T15:00:00Z' },
      { id: '4', created_at: '2026-07-08T08:00:00Z' },
    ]
    const g = gruppiereNachrichtenNachTag(n, JETZT)
    expect(g).toHaveLength(3)
    expect(g[0].tagLabel).toBe('06.07.2026')
    expect(g[0].nachrichten.map((x) => x.id)).toEqual(['1'])
    expect(g[1].tagLabel).toBe('Gestern')
    expect(g[1].nachrichten.map((x) => x.id)).toEqual(['2', '3'])
    expect(g[2].tagLabel).toBe('Heute')
    expect(g[2].nachrichten.map((x) => x.id)).toEqual(['4'])
  })
})
