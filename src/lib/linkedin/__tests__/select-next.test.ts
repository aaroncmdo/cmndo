// src/lib/linkedin/__tests__/select-next.test.ts
import { describe, it, expect } from 'vitest'
import { selectNextUnposted } from '../select-next'
import type { LinkedInFeedItem } from '../types'

const mk = (guid: string, date: string): LinkedInFeedItem => ({
  guid, url: guid, title: guid, excerpt: '', keyFacts: [], assetType: 'Spoke', datePublished: date,
})

describe('selectNextUnposted', () => {
  it('picks the newest item not in seen', () => {
    const items = [mk('a', '2026-01-01'), mk('b', '2026-03-01'), mk('c', '2026-02-01')]
    expect(selectNextUnposted(items, new Set(['b']))?.guid).toBe('c') // newest unseen
  })
  it('returns null when all seen', () => {
    const items = [mk('a', '2026-01-01')]
    expect(selectNextUnposted(items, new Set(['a']))).toBeNull()
  })
  it('returns null for empty feed', () => {
    expect(selectNextUnposted([], new Set())).toBeNull()
  })
})
