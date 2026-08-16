import { describe, it, expect } from 'vitest'
import { extractAnthropicText } from '../extract-text'

describe('extractAnthropicText', () => {
  it('liest den Text, wenn er im ERSTEN Block steht (der haeufige Fall)', () => {
    expect(extractAnthropicText([{ type: 'text', text: 'hallo' }])).toBe('hallo')
  })

  it('findet den Text auch HINTER einem thinking-Block — der eigentliche Bug', () => {
    // Prod 16.08.: stop_reason=end_turn, output_tokens=715, extrahierte Laenge 0.
    // content[0] war ein thinking-Block, das fertige SVG stand in content[1].
    const content = [
      { type: 'thinking', text: undefined },
      { type: 'text', text: '<svg viewBox="0 0 600 400"></svg>' },
    ]
    expect(extractAnthropicText(content)).toBe('<svg viewBox="0 0 600 400"></svg>')
  })

  it('fuegt mehrere Text-Bloecke zusammen', () => {
    expect(
      extractAnthropicText([
        { type: 'text', text: 'A' },
        { type: 'text', text: 'B' },
      ]),
    ).toBe('A\nB')
  })

  it('ignoriert redacted_thinking und Tool-Bloecke', () => {
    const content = [
      { type: 'redacted_thinking' },
      { type: 'tool_use' },
      { type: 'text', text: 'nutzbar' },
    ]
    expect(extractAnthropicText(content)).toBe('nutzbar')
  })

  it('gibt leer zurueck, wenn KEIN Text-Block existiert', () => {
    expect(extractAnthropicText([{ type: 'thinking' }])).toBe('')
    expect(extractAnthropicText([])).toBe('')
    expect(extractAnthropicText(undefined)).toBe('')
    expect(extractAnthropicText(null)).toBe('')
  })
})
