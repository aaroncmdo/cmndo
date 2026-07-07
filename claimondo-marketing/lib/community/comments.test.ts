import { describe, it, expect } from 'vitest'
import { mapCommentRows } from './comments'

describe('mapCommentRows', () => {
  it('mappt author_display auf username', () => {
    const rows = [{ id: 'c1', body: 'Hallo', created_at: '2026-06-29T10:00:00Z', author_display: 'Schmidt Sachverständige Köln' }]
    expect(mapCommentRows(rows)).toEqual([
      { id: 'c1', username: 'Schmidt Sachverständige Köln', body: 'Hallo', createdAt: '2026-06-29T10:00:00Z' },
    ])
  })
  it('trimmt author_display', () => {
    const rows = [{ id: 'c2', body: 'X', created_at: '2026-06-29T10:00:00Z', author_display: '  eva  ' }]
    expect(mapCommentRows(rows)[0].username).toBe('eva')
  })
  it('faellt bei fehlendem author_display auf "unbekannt" zurueck', () => {
    const rows = [{ id: 'c3', body: 'Y', created_at: '2026-06-29T10:00:00Z', author_display: null }]
    expect(mapCommentRows(rows)[0].username).toBe('unbekannt')
  })
})
