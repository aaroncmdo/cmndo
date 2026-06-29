// src/lib/linkedin/__tests__/feed-source.test.ts
import { describe, it, expect } from 'vitest'
import { parseJsonFeed } from '../feed-source'

const SAMPLE = {
  version: 'https://jsonfeed.org/version/1.1',
  items: [
    {
      id: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      url: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      title: 'Online-Kfz-Gutachten',
      summary: 'Einordnung des LG-Bremen-Urteils.',
      date_published: '2026-05-25T00:00:00.000Z',
      tags: ['Strategic'],
      _claimondo: { assetType: 'Strategic', keyFacts: ['LG Bremen 9 O 1720/24'] },
    },
  ],
}

describe('parseJsonFeed', () => {
  it('maps JSON Feed items to LinkedInFeedItem', () => {
    const items = parseJsonFeed(SAMPLE)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      guid: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      url: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      title: 'Online-Kfz-Gutachten',
      excerpt: 'Einordnung des LG-Bremen-Urteils.',
      keyFacts: ['LG Bremen 9 O 1720/24'],
      assetType: 'Strategic',
      datePublished: '2026-05-25T00:00:00.000Z',
    })
  })

  it('returns [] for malformed input', () => {
    expect(parseJsonFeed({})).toEqual([])
    expect(parseJsonFeed(null)).toEqual([])
  })
})
