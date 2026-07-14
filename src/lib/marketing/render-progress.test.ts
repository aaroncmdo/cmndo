import { describe, it, expect } from 'vitest'
import { videoRenderPct, renderPhaseLabel } from './render-progress'

describe('videoRenderPct', () => {
  it('mappt frac 0..1 auf 35..90', () => {
    expect(videoRenderPct(0)).toBe(35)
    expect(videoRenderPct(1)).toBe(90)
    expect(videoRenderPct(0.5)).toBe(63) // round(35 + 55*0.5 = 62.5)
  })

  it('klemmt ausserhalb 0..100', () => {
    expect(videoRenderPct(2)).toBe(100)
    expect(videoRenderPct(-1)).toBe(0)
  })
})

describe('renderPhaseLabel', () => {
  it('liefert Labels fuer bekannte Phasen', () => {
    expect(renderPhaseLabel('voiceover')).toBe('Voiceover')
    expect(renderPhaseLabel('video')).toBe('Video-Render')
    expect(renderPhaseLabel('upload')).toBe('Upload')
  })

  it('Fallback bei null/unbekannt', () => {
    expect(renderPhaseLabel(null)).toBe('Wird gerendert')
    expect(renderPhaseLabel('xyz')).toBe('xyz')
  })
})
