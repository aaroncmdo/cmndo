// src/lib/linkedin/__tests__/compose-llm.test.ts
import { describe, it, expect } from 'vitest'
import { composePost } from '../compose'
import type { LinkedInFeedItem } from '../types'

const ITEM: LinkedInFeedItem = {
  guid: 'g', url: 'https://claimondo.de/x', title: 'T',
  excerpt: 'E', keyFacts: ['F1'], assetType: 'Spoke', datePublished: '2026-01-01T00:00:00.000Z',
}

describe('composePost', () => {
  it('uses the LLM output when generation succeeds', async () => {
    const text = await composePost(ITEM, { generate: async () => 'LLM-TEXT mit Link https://claimondo.de/x' })
    expect(text).toContain('LLM-TEXT')
    expect(text).toContain('https://claimondo.de/x')
  })
  it('appends the link if the LLM omitted it', async () => {
    const text = await composePost(ITEM, { generate: async () => 'Nur Text ohne Link' })
    expect(text).toContain('https://claimondo.de/x')
  })
  it('falls back to the template when generation throws', async () => {
    const text = await composePost(ITEM, { generate: async () => { throw new Error('LLM down') } })
    expect(text).toContain('• F1')
    expect(text).toContain('https://claimondo.de/x')
  })
  it('falls back when the LLM returns empty', async () => {
    const text = await composePost(ITEM, { generate: async () => '   ' })
    expect(text).toContain('• F1')
  })
})
