import { describe, it, expect } from 'vitest'
import { mergeFeed, type FeedEntry } from './community-queries'

function makeEntry(overrides: Partial<FeedEntry> & { createdAt: string; id: string }): FeedEntry {
  return {
    kind: 'post',
    title: null,
    body: 'test body',
    authorDisplay: 'Test Autor',
    rang: null,
    isRedaktion: false,
    tags: [],
    likeCount: 0,
    commentCount: 0,
    slug: null,
    ...overrides,
  }
}

describe('mergeFeed', () => {
  it('returns entries sorted by createdAt descending', () => {
    const a: FeedEntry[] = [
      makeEntry({ id: 'a1', createdAt: '2026-06-01T00:00:00Z' }),
      makeEntry({ id: 'a2', createdAt: '2026-06-10T00:00:00Z' }),
    ]
    const b: FeedEntry[] = [
      makeEntry({ id: 'b1', createdAt: '2026-06-05T00:00:00Z' }),
    ]
    const result = mergeFeed(a, b)
    expect(result.map((r) => r.id)).toEqual(['a2', 'b1', 'a1'])
  })

  it('preserves entries from both input arrays', () => {
    const a: FeedEntry[] = [
      makeEntry({ id: 'post-1', kind: 'post', createdAt: '2026-07-01T00:00:00Z' }),
    ]
    const b: FeedEntry[] = [
      makeEntry({ id: 'artikel-1', kind: 'artikel', createdAt: '2026-07-02T00:00:00Z' }),
    ]
    const result = mergeFeed(a, b)
    expect(result).toHaveLength(2)
    expect(result.some((r) => r.kind === 'artikel')).toBe(true)
    expect(result.some((r) => r.kind === 'post')).toBe(true)
  })

  it('places the most recent entry first regardless of which array it came from', () => {
    const a: FeedEntry[] = [
      makeEntry({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    const b: FeedEntry[] = [
      makeEntry({ id: 'new', createdAt: '2026-06-30T00:00:00Z' }),
    ]
    const result = mergeFeed(a, b)
    expect(result[0].id).toBe('new')
    expect(result[1].id).toBe('old')
  })

  it('handles empty arrays', () => {
    expect(mergeFeed([], [])).toEqual([])
    const a: FeedEntry[] = [makeEntry({ id: 'x', createdAt: '2026-06-01T00:00:00Z' })]
    expect(mergeFeed(a, [])).toHaveLength(1)
    expect(mergeFeed([], a)).toHaveLength(1)
  })

  it('does not mutate input arrays', () => {
    const a: FeedEntry[] = [makeEntry({ id: 'a', createdAt: '2026-06-01T00:00:00Z' })]
    const b: FeedEntry[] = [makeEntry({ id: 'b', createdAt: '2026-06-02T00:00:00Z' })]
    const aLen = a.length
    const bLen = b.length
    mergeFeed(a, b)
    expect(a).toHaveLength(aLen)
    expect(b).toHaveLength(bLen)
  })
})
