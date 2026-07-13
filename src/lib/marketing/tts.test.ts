import { describe, it, expect, vi, afterEach } from 'vitest'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { charsToWords, estimateWords, wavDurationSeconds, synthesize } from './tts'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ELEVENLABS_API_KEY
  delete process.env.PIPER_MODEL
})

describe('charsToWords', () => {
  it('gruppiert Zeichen an Whitespace zu Wort-Timings', () => {
    const words = charsToWords({
      characters: ['H', 'i', ' ', 'd', 'u'],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
    })
    expect(words).toHaveLength(2)
    expect(words[0]).toEqual({ word: 'Hi', start: 0, end: 0.2 })
    expect(words[1].word).toBe('du')
    expect(words[1].end).toBeCloseTo(0.5)
  })
})

describe('estimateWords', () => {
  it('verteilt die Gesamtdauer proportional zur Wortlaenge, lueckenlos', () => {
    const words = estimateWords('a bb ccc', 6)
    expect(words.map((w) => w.word)).toEqual(['a', 'bb', 'ccc'])
    expect(words[0].start).toBe(0)
    expect(words.at(-1)!.end).toBeCloseTo(6, 5)
    // luekenlos: jedes end == naechstes start
    expect(words[1].start).toBeCloseTo(words[0].end, 5)
  })
})

describe('wavDurationSeconds', () => {
  it('berechnet Dauer aus byteRate + data-chunk-Groesse', async () => {
    const buf = Buffer.alloc(48)
    buf.write('RIFF', 0)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(88200, 28) // byteRate
    buf.write('data', 36)
    buf.writeUInt32LE(176400, 40) // dataSize -> 176400/88200 = 2.0s
    const p = join(tmpdir(), `mktest-${Date.now()}.wav`)
    await writeFile(p, buf)
    try {
      expect(await wavDurationSeconds(p)).toBeCloseTo(2.0, 5)
    } finally {
      await unlink(p)
    }
  })
})

describe('synthesize', () => {
  it('nutzt ElevenLabs wenn verfuegbar (mock fetch) und liefert Wort-Timings', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          audio_base64: Buffer.from('audio').toString('base64'),
          alignment: {
            characters: ['H', 'i'],
            character_start_times_seconds: [0, 0.1],
            character_end_times_seconds: [0.1, 0.2],
          },
        }),
      }),
    )
    const base = join(tmpdir(), `mktts-${Date.now()}`)
    const r = await synthesize('Hi', base)
    try {
      expect(r.engine).toBe('elevenlabs')
      expect(r.audioPath).toBe(`${base}.mp3`)
      expect(r.words[0].word).toBe('Hi')
    } finally {
      await unlink(r.audioPath).catch(() => {})
    }
  })

  it('faellt auf Piper zurueck wenn ElevenLabs fehlschlaegt (402)', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key'
    // kein PIPER_MODEL gesetzt -> Piper wirft -> synthesize wirft (belegt: Fallback-Zweig betreten)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'payment_required' }),
    )
    await expect(synthesize('Hi', join(tmpdir(), 'x'))).rejects.toThrow(/PIPER_MODEL/)
  })
})
