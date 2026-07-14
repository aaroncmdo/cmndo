import type { ContentScript } from './schema'
import type { WordTiming } from './tts'
import type { ResolvedVisual } from './visual-resolver'
import type { ContentClipProps, RenderSegment } from '../../remotion/types'

/**
 * Assembliert die Remotion-Render-Props aus Skript + Wort-Timings + aufgeloesten Visuals.
 * Port der validierten PoC-Logik (scripts/marketing-poc/run.mjs): Woerter sequentiell den
 * Segmenten zuordnen, absolute Start/End-Frames, Untertitel relativ zum Segment-Start.
 * Pure Funktion (audioSrc setzt der Orchestrator nach dem Storage-Upload).
 */
export function buildRenderProps(
  script: ContentScript,
  words: WordTiming[],
  visuals: ResolvedVisual[],
  fps = 30,
): ContentClipProps {
  const segments: RenderSegment[] = []
  let wi = 0
  script.segmente.forEach((seg, idx) => {
    const n = Math.max(1, seg.text.split(/\s+/).filter(Boolean).length)
    const segWords = words.slice(wi, wi + n)
    wi += n
    const start = segWords[0]?.start ?? 0
    const end = segWords.at(-1)?.end ?? start + 2
    segments.push({
      startFrame: Math.round(start * fps),
      endFrame: Math.round(end * fps),
      on_screen_text: seg.on_screen_text,
      words: segWords.map((w) => ({ word: w.word, start: w.start - start, end: w.end - start })),
      visual: visuals[idx] ?? { kind: 'graphic' },
    })
  })
  const totalSecs = (words.at(-1)?.end ?? 30) + 0.8
  // audioSrc + musicSrc setzt der Orchestrator nach Storage-Upload/Resolve.
  return { segments, audioSrc: null, musicSrc: null, durationInFrames: Math.ceil(totalSecs * fps) }
}
