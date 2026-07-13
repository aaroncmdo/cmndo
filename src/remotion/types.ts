import type { WordTiming } from '../lib/marketing/tts'
import type { ResolvedVisual } from '../lib/marketing/visual-resolver'

// type-only Imports -> beim Kompilieren erased, kein Server-Code im Browser-Bundle.

export interface RenderSegment {
  startFrame: number
  endFrame: number
  on_screen_text?: string
  words: WordTiming[]
  visual: ResolvedVisual
}

// extends Record<string, unknown>: Remotion <Composition> verlangt props, die diesen
// Constraint erfuellen (serialisierbare inputProps) - so wird Props korrekt inferiert.
export interface ContentClipProps extends Record<string, unknown> {
  segments: RenderSegment[]
  audioSrc: string | null
  durationInFrames: number
}
