import { describe, it, expect } from 'vitest'
import { mergeFeed, type FeedEntry } from './feed'

const mk = (id: string, createdAt: string, kind: FeedEntry['kind'] = 'post'): FeedEntry => ({
  kind, id, title: null, body: 'x', authorDisplay: 'A', isRedaktion: false,
  tags: [], createdAt, likeCount: 0, commentCount: 0, slug: null,
})

describe('mergeFeed', () => {
  it('sortiert nach createdAt desc', () => {
    const out = mergeFeed([mk('a', '2026-01-01T00:00:00Z')], [mk('b', '2026-02-01T00:00:00Z')])
    expect(out.map(e => e.id)).toEqual(['b', 'a'])
  })
  it('ist leer bei zwei leeren Eingaben', () => {
    expect(mergeFeed([], [])).toEqual([])
  })
})
