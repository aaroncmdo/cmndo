import { describe, it, expect } from 'vitest'
import { rankTopComments, type CommentRow } from './threads'

const c = (id: string, likeCount: number, createdAt: string, parentId: string | null = null): CommentRow => ({
  id, authorDisplay: 'A', authorKind: 'partner', isRedaktion: false, body: id, parentId, createdAt, likeCount,
})

describe('rankTopComments', () => {
  it('nimmt Top-2 Kommentare nach Likes, Tiebreak neueste', () => {
    const top = [
      c('a', 1, '2026-01-01T00:00:00Z'),
      c('b', 5, '2026-01-01T00:00:00Z'),
      c('c', 5, '2026-02-01T00:00:00Z'),
    ]
    const out = rankTopComments(top, {})
    expect(out.map(p => p.comment.id)).toEqual(['c', 'b']) // 5&5 -> neuere zuerst, dann 'b'
  })
  it('waehlt je Kommentar die Top-Antwort nach Likes + zaehlt Antworten', () => {
    const top = [c('a', 0, '2026-01-01T00:00:00Z')]
    const replies = { a: [c('r1', 2, '2026-01-02T00:00:00Z', 'a'), c('r2', 9, '2026-01-03T00:00:00Z', 'a')] }
    const out = rankTopComments(top, replies)
    expect(out[0].topReply?.id).toBe('r2')
    expect(out[0].replyCount).toBe(2)
  })
})
