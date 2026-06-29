// src/lib/linkedin/publisher.ts
import type { LinkedInPublisher, LinkedInPublishInput, LinkedInPublishResult } from './types'

const LINKEDIN_VERSION = '202505' // YYYYMM — bump to a currently-supported version at deploy time

export class PostsApiPublisher implements LinkedInPublisher {
  private fetchImpl: typeof fetch
  constructor(private token: string, deps: { fetch?: typeof fetch } = {}) {
    this.fetchImpl = deps.fetch ?? fetch
  }

  async publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult> {
    const body = {
      author: input.authorUrn,
      commentary: input.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: input.link, title: input.title, description: input.description } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    let res: Response
    try {
      res = await this.fetchImpl('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      return { ok: false, error: `Netzwerkfehler: ${(e as Error).message}` }
    }
    if (res.status !== 201 && res.status !== 200) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `LinkedIn ${res.status}: ${detail.slice(0, 300)}` }
    }
    const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id') ?? ''
    if (!urn) return { ok: false, error: 'Kein Post-URN in der Antwort.' }
    return { ok: true, postUrn: urn }
  }
}
