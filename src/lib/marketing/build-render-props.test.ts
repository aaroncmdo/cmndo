import { describe, it, expect } from 'vitest'
import { buildRenderProps } from './build-render-props'
import type { ContentScript } from './schema'
import type { WordTiming } from './tts'
import type { ResolvedVisual } from './visual-resolver'

const script: ContentScript = {
  hook: 'H',
  segmente: [
    { text: 'Ruhe bewahren', on_screen_text: '1. Ruhe', visual: { typ: 'stock', queries: ['x'] } },
    { text: 'Alles fotografieren', visual: { typ: 'grafik' } },
  ],
  caption: 'c',
  hashtags: [],
}
// 2 + 2 Woerter, 1s pro Wort
const words: WordTiming[] = [
  { word: 'Ruhe', start: 0, end: 1 },
  { word: 'bewahren', start: 1, end: 2 },
  { word: 'Alles', start: 2, end: 3 },
  { word: 'fotografieren', start: 3, end: 4 },
]
const visuals: ResolvedVisual[] = [{ kind: 'stock', ref: 'clip.mp4' }, { kind: 'graphic' }]

describe('buildRenderProps', () => {
  it('ordnet Woerter den Segmenten zu und rechnet absolute Frames (fps=30)', () => {
    const props = buildRenderProps(script, words, visuals, 30)
    expect(props.segments).toHaveLength(2)
    expect(props.segments[0].startFrame).toBe(0)
    expect(props.segments[0].endFrame).toBe(60) // 2s * 30
    expect(props.segments[1].startFrame).toBe(60) // 2s
    expect(props.segments[1].endFrame).toBe(120) // 4s
  })

  it('macht Untertitel-Timings relativ zum Segment-Start', () => {
    const props = buildRenderProps(script, words, visuals, 30)
    // Segment 2: erstes Wort 'Alles' absolut 2s -> relativ 0
    expect(props.segments[1].words[0]).toEqual({ word: 'Alles', start: 0, end: 1 })
  })

  it('haengt die aufgeloesten Visuals je Segment an', () => {
    const props = buildRenderProps(script, words, visuals, 30)
    expect(props.segments[0].visual).toEqual({ kind: 'stock', ref: 'clip.mp4' })
    expect(props.segments[1].visual).toEqual({ kind: 'graphic' })
  })

  it('setzt durationInFrames aus der Gesamtdauer + Puffer', () => {
    const props = buildRenderProps(script, words, visuals, 30)
    expect(props.durationInFrames).toBe(Math.ceil((4 + 0.8) * 30)) // 144
    expect(props.audioSrc).toBeNull()
  })
})
