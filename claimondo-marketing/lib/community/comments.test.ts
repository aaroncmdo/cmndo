import { describe, it, expect } from 'vitest'
import { mapCommentRows } from './comments'

describe('mapCommentRows', () => {
  it('mappt joined rows auf CommentRow', () => {
    const rows = [{ id: 'c1', body: 'Hallo', created_at: '2026-06-29T10:00:00Z', community_profiles: { username: 'max' } }]
    expect(mapCommentRows(rows)).toEqual([{ id: 'c1', username: 'max', body: 'Hallo', createdAt: '2026-06-29T10:00:00Z' }])
  })
  it('normalisiert ein Array-Profil (nimmt das erste)', () => {
    const rows = [{ id: 'c2', body: 'X', created_at: '2026-06-29T10:00:00Z', community_profiles: [{ username: 'eva' }] }]
    expect(mapCommentRows(rows)[0].username).toBe('eva')
  })
  it('normalisiert fehlendes Profil zu "unbekannt"', () => {
    const rows = [{ id: 'c3', body: 'Y', created_at: '2026-06-29T10:00:00Z', community_profiles: null }]
    expect(mapCommentRows(rows)[0].username).toBe('unbekannt')
  })
})
