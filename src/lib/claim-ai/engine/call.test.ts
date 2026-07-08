import { describe, it, expect, vi, beforeEach } from 'vitest'

// Anthropic-SDK + logAiUsage mocken (die Engine kapselt beide).
const { messagesCreate, logAiUsageSpy } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  logAiUsageSpy: vi.fn(async () => {}),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: messagesCreate }
  },
}))
vi.mock('@/lib/ai/usage-log', () => ({ logAiUsage: logAiUsageSpy }))

import { callForProposals } from './call'

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
        model: 'm', max_tokens: 1500, system: 'sys', tools: [],
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
