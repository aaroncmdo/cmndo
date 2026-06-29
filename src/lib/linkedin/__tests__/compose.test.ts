// src/lib/linkedin/__tests__/compose.test.ts
import { describe, it, expect } from 'vitest'
import { composeTemplate } from '../compose'
import { hashtagsFor } from '../hashtags'
import type { LinkedInFeedItem } from '../types'

const ITEM: LinkedInFeedItem = {
  guid: 'https://claimondo.de/x', url: 'https://claimondo.de/x',
  title: 'Online-Kfz-Gutachten — was erlaubt ist',
  excerpt: 'Einordnung des LG-Bremen-Urteils für Geschädigte.',
  keyFacts: ['LG Bremen 9 O 1720/24', 'Vor-Ort-Besichtigung Pflicht', 'Hybride Modelle BGH-konform'],
  assetType: 'Strategic', datePublished: '2026-05-25T00:00:00.000Z',
}

describe('hashtagsFor', () => {
  it('returns 3–5 hashtags starting with #', () => {
    const tags = hashtagsFor('Strategic')
    expect(tags.length).toBeGreaterThanOrEqual(3)
    expect(tags.length).toBeLessThanOrEqual(5)
    expect(tags.every((t) => t.startsWith('#'))).toBe(true)
  })
  it('falls back for unknown assetType', () => {
    expect(hashtagsFor('Unknown').length).toBeGreaterThanOrEqual(3)
  })
})

describe('composeTemplate', () => {
  it('includes title, key facts, url and hashtags, keeps umlauts', () => {
    const text = composeTemplate(ITEM)
    expect(text).toContain('Online-Kfz-Gutachten')
    expect(text).toContain('• LG Bremen 9 O 1720/24')
    expect(text).toContain('https://claimondo.de/x')
    expect(text).toContain('#')
    expect(text).toContain('Geschädigte')
  })
  it('stays under the LinkedIn 3000-char commentary limit', () => {
    expect(composeTemplate(ITEM).length).toBeLessThanOrEqual(3000)
  })
})
