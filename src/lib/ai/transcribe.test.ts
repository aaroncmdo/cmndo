import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeAudio } from './transcribe'

describe('transcribeAudio', () => {
  const OLD_KEY = process.env.GROQ_API_KEY

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key'
  })
  afterEach(() => {
    process.env.GROQ_API_KEY = OLD_KEY
    vi.restoreAllMocks()
  })

  it('leeres Audio -> 400 (kein Groq-Call)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const r = await transcribeAudio(new Blob([]))
    expect(r).toMatchObject({ ok: false, status: 400 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('zu grosses Audio -> 413', async () => {
    const big = new Blob([new Uint8Array(11 * 1024 * 1024)])
    const r = await transcribeAudio(big)
    expect(r).toMatchObject({ ok: false, status: 413 })
  })

  it('fehlender GROQ_API_KEY -> 500', async () => {
    delete process.env.GROQ_API_KEY
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toMatchObject({ ok: false, status: 500 })
  })

  it('Groq 429 -> 429 durchgereicht', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }))
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toMatchObject({ ok: false, status: 429 })
  })

  it('Groq-Fehler (500) -> 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toMatchObject({ ok: false, status: 502 })
  })

  it('Groq ok -> getrimmter Transcript', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '  Ich fuhr nach links.  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toEqual({ ok: true, transcript: 'Ich fuhr nach links.' })
  })

  it('Groq leerer Text -> 422', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '   ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toMatchObject({ ok: false, status: 422 })
  })

  it('fetch wirft -> 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    const r = await transcribeAudio(new Blob(['x']))
    expect(r).toMatchObject({ ok: false, status: 502 })
  })
})
