import { describe, it, expect, vi } from 'vitest'
import { generiereSkript } from './generate-script'

function mockClient(toolInput: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'liefere_clip', input: toolInput }],
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default
}

const validInput = {
  hook: 'Unfall gehabt?',
  segmente: [
    { text: 'Ruhe bewahren.', on_screen_text: '1. Ruhe', visual: { typ: 'stock', queries: ['car accident'] } },
    { text: 'Absichern.', visual: { typ: 'marke', tags: ['warndreieck'] } },
    { text: 'Fotografieren.', visual: { typ: 'grafik' } },
  ],
  caption: 'So gehts.',
  hashtags: ['Autounfall'],
}

describe('generiereSkript', () => {
  it('gibt validiertes Skript zurueck und ruft Claude mit Opus + erzwungenem Tool', async () => {
    const client = mockClient(validInput)
    const r = await generiereSkript('Was tun nach Unfall?', 'ratgeber', client)
    expect(r.caption).toBe('So gehts.')
    expect(r.segmente).toHaveLength(3)
    // @ts-expect-error - mock create is a vi.fn
    const call = client.messages.create.mock.calls[0][0]
    expect(call.model).toBe('claude-opus-4-8')
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'liefere_clip' })
  })

  it('leitet das Format in die User-Message (ad vs ratgeber)', async () => {
    const client = mockClient(validInput)
    await generiereSkript('Thema', 'ad', client)
    // @ts-expect-error - mock
    const msg = client.messages.create.mock.calls[0][0].messages[0].content as string
    expect(msg).toContain('Call-to-Action')
  })

  it('wirft, wenn kein tool_use zurueckkommt', async () => {
    const client = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'nope' }] }) },
    } as unknown as import('@anthropic-ai/sdk').default
    await expect(generiereSkript('T', 'ratgeber', client)).rejects.toThrow()
  })

  it('wirft bei schema-invalidem Tool-Output (leere segmente)', async () => {
    const client = mockClient({ hook: 'H', segmente: [], caption: 'c', hashtags: [] })
    await expect(generiereSkript('T', 'ratgeber', client)).rejects.toThrow()
  })
})
