import { describe, it, expect } from 'vitest'
import { appendTranscript } from './append-transcript'

describe('appendTranscript', () => {
  it('gibt nur den Transcript bei leerem Bestand', () => {
    expect(appendTranscript('', 'Hallo Welt')).toBe('Hallo Welt')
    expect(appendTranscript('   ', 'Hallo')).toBe('Hallo')
  })

  it('haengt mit genau einem Space an (auch bei trailing space im Bestand)', () => {
    expect(appendTranscript('Ich fuhr', 'nach links')).toBe('Ich fuhr nach links')
    expect(appendTranscript('Ich fuhr ', 'nach links')).toBe('Ich fuhr nach links')
    expect(appendTranscript('Ich fuhr   ', 'nach links')).toBe('Ich fuhr nach links')
  })

  it('trimmt den hinzugefuegten Transcript', () => {
    expect(appendTranscript('A', '  B  ')).toBe('A B')
  })

  it('leerer/whitespace Transcript aendert den Bestand nicht', () => {
    expect(appendTranscript('Bestand', '   ')).toBe('Bestand')
    expect(appendTranscript('Bestand', '')).toBe('Bestand')
  })

  it('nullish-sicher', () => {
    // @ts-expect-error absichtlich null
    expect(appendTranscript(null, 'X')).toBe('X')
    // @ts-expect-error absichtlich null
    expect(appendTranscript('A', null)).toBe('A')
  })
})
