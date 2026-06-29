// src/lib/linkedin/__tests__/publisher.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PostsApiPublisher } from '../publisher'

const INPUT = {
  authorUrn: 'urn:li:organization:123', text: 'Hallo Welt',
  link: 'https://claimondo.de/x', title: 'T', description: 'D',
}

describe('PostsApiPublisher', () => {
  it('POSTs correct shape and returns the post URN from x-restli-id', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 201, headers: { 'x-restli-id': 'urn:li:share:999' },
    }))
    const pub = new PostsApiPublisher('tok', { fetch: fetchMock as unknown as typeof fetch })
    const res = await pub.publish(INPUT)
    expect(res).toEqual({ ok: true, postUrn: 'urn:li:share:999' })
    const call = fetchMock.mock.calls.at(0)!
    const [url, init] = call as unknown as [string, RequestInit]
    expect(url).toBe('https://api.linkedin.com/rest/posts')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok')
    expect(headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
    const body = JSON.parse(init.body as string)
    expect(body.author).toBe('urn:li:organization:123')
    expect(body.commentary).toBe('Hallo Welt')
    expect(body.content.article.source).toBe('https://claimondo.de/x')
    expect(body.lifecycleState).toBe('PUBLISHED')
  })

  it('maps API errors to { ok:false }', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 422 }))
    const pub = new PostsApiPublisher('tok', { fetch: fetchMock as unknown as typeof fetch })
    const res = await pub.publish(INPUT)
    expect(res.ok).toBe(false)
  })
})
