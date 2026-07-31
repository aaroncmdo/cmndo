import { describe, it, expect, vi, beforeEach } from 'vitest'

// Anthropic-SDK + logAiUsage mocken (die Engine kapselt beide).
const { messagesCreate, messagesStream, logAiUsageSpy } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  messagesStream: vi.fn(),
  logAiUsageSpy: vi.fn(async () => {}),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: messagesCreate, stream: messagesStream }
  },
}))
vi.mock('@/lib/ai/usage-log', () => ({ logAiUsage: logAiUsageSpy }))

import { callForProposals, streamForProposals } from './call'

// mock-Stream: async-iterable Events + finalMessage()
function fakeStream(deltas: string[], final: unknown) {
  const events = deltas.map((text) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } }))
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e
    },
    finalMessage: async () => final,
  }
}

describe('callForProposals', () => {
  beforeEach(() => {
    messagesCreate.mockReset()
    logAiUsageSpy.mockReset()
    logAiUsageSpy.mockResolvedValue(undefined)
  })

  it('ruft messages.create mit den Params + gibt extract(content) zurück', async () => {
    const content = [{ type: 'tool_use', name: 'x', input: {} }]
    messagesCreate.mockResolvedValue({ content, usage: { input_tokens: 10, output_tokens: 5 } })
    const extract = vi.fn(() => ['draft-a'])
    const out = await callForProposals({
      model: 'm', system: 'sys', tools: [], userContent: 'ctx',
      maxTokens: 1500, logEndpoint: 'ep', logFallId: 'f1', extract,
    })
    expect(out).toEqual(['draft-a'])
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'm', max_tokens: 1500, tools: [],
        // System wird als cache_control-Block uebergeben (Prompt-Caching des
        // stabilen tools+system-Prefix) — der Input bleibt system: string.
        system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: 'ctx' }],
      }),
    )
    expect(extract).toHaveBeenCalledWith(content)
  })

  it('default max_tokens=1024 wenn nicht gesetzt', async () => {
    messagesCreate.mockResolvedValue({ content: [], usage: { input_tokens: 1, output_tokens: 1 } })
    await callForProposals({ model: 'm', system: 's', tools: [], userContent: 'c', logEndpoint: 'ep', extract: () => [] })
    expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1024 }))
  })

  it('loggt Usage (endpoint/fallId/usage)', async () => {
    messagesCreate.mockResolvedValue({ content: [], usage: { input_tokens: 10, output_tokens: 5 } })
    await callForProposals({ model: 'm', system: 's', tools: [], userContent: 'c', logEndpoint: 'ep', logFallId: 'f1', extract: () => [] })
    expect(logAiUsageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'ep', model: 'm', fallId: 'f1', usage: { input_tokens: 10, output_tokens: 5 } }),
    )
  })

  it('Anthropic-Fehler → [] (wirft nie)', async () => {
    messagesCreate.mockRejectedValue(new Error('boom'))
    const out = await callForProposals({ model: 'm', system: 's', tools: [], userContent: 'c', logEndpoint: 'ep', extract: () => ['x'] })
    expect(out).toEqual([])
  })

  it('logAiUsage-Fehler bricht nicht (non-critical)', async () => {
    messagesCreate.mockResolvedValue({ content: [{ type: 'tool_use', name: 'x', input: {} }], usage: { input_tokens: 1, output_tokens: 1 } })
    logAiUsageSpy.mockRejectedValue(new Error('log fail'))
    const out = await callForProposals({ model: 'm', system: 's', tools: [], userContent: 'c', logEndpoint: 'ep', extract: () => ['ok'] })
    expect(out).toEqual(['ok'])
  })
})

describe('streamForProposals', () => {
  beforeEach(() => {
    messagesStream.mockReset()
    logAiUsageSpy.mockReset()
    logAiUsageSpy.mockResolvedValue(undefined)
  })

  it('streamt Text-Deltas per onTextDelta + extrahiert aus finalMessage', async () => {
    const content = [{ type: 'tool_use', name: 'x', input: {} }]
    messagesStream.mockReturnValue(fakeStream(['Hal', 'lo'], { content, usage: { input_tokens: 3, output_tokens: 2 } }))
    const chunks: string[] = []
    const extract = vi.fn(() => ['d1'])
    const out = await streamForProposals({
      model: 'm', system: 's', tools: [], messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 2048, logEndpoint: 'cp', logFallId: 'f', extract,
      onTextDelta: (t) => chunks.push(t),
    })
    expect(chunks).toEqual(['Hal', 'lo'])
    expect(out).toEqual(['d1'])
    expect(extract).toHaveBeenCalledWith(content)
    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm', max_tokens: 2048, messages: [{ role: 'user', content: 'hi' }] }),
    )
  })

  it('loggt Usage aus finalMessage', async () => {
    messagesStream.mockReturnValue(fakeStream([], { content: [], usage: { input_tokens: 7, output_tokens: 4 } }))
    await streamForProposals({ model: 'm', system: 's', tools: [], messages: [], logEndpoint: 'cp', extract: () => [], onTextDelta: () => {} })
    expect(logAiUsageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'cp', usage: { input_tokens: 7, output_tokens: 4 } }),
    )
  })

  it('WIRFT bei Stream-Fehler (anders als callForProposals → Caller signalisiert SSE-Abbruch)', async () => {
    messagesStream.mockImplementation(() => {
      throw new Error('stream boom')
    })
    await expect(
      streamForProposals({ model: 'm', system: 's', tools: [], messages: [], logEndpoint: 'cp', extract: () => [], onTextDelta: () => {} }),
    ).rejects.toThrow('stream boom')
  })
})
