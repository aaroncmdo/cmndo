// Token-Audit-Skip: Remotion-Composition rendert headless (kein Tailwind/CSS-Var-Kontext)
//   -> Marken-Hex literal noetig, analog PDF-/Email-Generation. Siehe AGENTS.md §branding-rules.
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion'
import type { WordTiming } from '../lib/marketing/tts'
import type { ContentClipProps, RenderSegment } from './types'
import { BrandVisual } from './brand-library/BrandVisual'

const NAVY = '#0D1B3E'
const ACCENT = '#4573A2'
const CREAM = '#F5F1E8'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

function AnimatedBg() {
  const f = useCurrentFrame()
  const shift = interpolate(f % 300, [0, 300], [0, 40])
  return (
    <AbsoluteFill style={{ background: `radial-gradient(130% 130% at ${18 + shift}% -10%, ${ACCENT}40, ${NAVY} 62%)` }}>
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 420px rgba(0,0,0,0.55)' }} />
    </AbsoluteFill>
  )
}

// B-Roll mit Ken-Burns-Zoom + Fade-in + Lesbarkeits-Gradient. Brand/Grafik gefadet.
function VisualLayer({ visual, segDuration }: { visual: RenderSegment['visual']; segDuration: number }) {
  const f = useCurrentFrame()
  const fade = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  if (visual.kind === 'stock') {
    const zoom = interpolate(f, [0, segDuration], [1.05, 1.18], { extrapolateRight: 'clamp' })
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <OffthreadVideo
          src={visual.ref}
          muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`, opacity: 0.62 }}
        />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${NAVY}00 24%, ${NAVY}33 54%, ${NAVY}e0 100%)` }} />
      </AbsoluteFill>
    )
  }
  if (visual.kind === 'brand') {
    const zoom = interpolate(f, [0, 14], [0.92, 1], { extrapolateRight: 'clamp' })
    return (
      <AbsoluteFill style={{ opacity: fade, transform: `scale(${zoom})` }}>
        <BrandVisual brandKey={visual.ref} />
      </AbsoluteFill>
    )
  }
  return null
}

function Overlay({ text }: { text?: string }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: f, fps, config: { damping: 14 } })
  if (!text) return null
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 200 }}>
      <div
        style={{
          transform: `translateY(${(1 - s) * 40}px) scale(${0.9 + s * 0.1})`,
          opacity: s,
          background: CREAM,
          color: NAVY,
          padding: '14px 30px',
          borderRadius: 999,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 40,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  )
}

// Woerter zu Phrasen-Chunks gruppieren (~5 Woerter ODER ~2.4s Sprechzeit).
// TikTok-Stil: nie die ganze Satz-Wand, sondern immer nur die aktuelle Phrase.
function chunkWords(words: WordTiming[]): WordTiming[][] {
  const chunks: WordTiming[][] = []
  let cur: WordTiming[] = []
  for (const w of words) {
    cur.push(w)
    const span = w.end - (cur[0]?.start ?? w.end)
    if (cur.length >= 5 || span >= 2.4) {
      chunks.push(cur)
      cur = []
    }
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

// Karaoke-Captions in Phrasen-Chunks: der aktuell gesprochene Chunk wird gezeigt,
// darin das aktive Wort in Creme-Highlight-Box (Navy) + Micro-Pop, noch nicht
// gesprochene Woerter des Chunks gedimmt. Chunks wechseln diskret -> kein Reflow.
function KineticCaption({ words }: { words: WordTiming[] }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = f / fps
  const chunks = chunkWords(words)
  if (!chunks.length) return null
  // aktueller Chunk = letzter, dessen erstes Wort schon begonnen hat
  let ci = 0
  for (let k = 0; k < chunks.length; k++) {
    if (t >= (chunks[k][0]?.start ?? 0)) ci = k
  }
  const chunk = chunks[ci]
  const chunkStart = chunk[0]?.start ?? 0
  const appear = interpolate(t, [chunkStart, chunkStart + 0.22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingLeft: 64, paddingRight: 64, paddingBottom: 380 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 12px', justifyContent: 'center', opacity: appear, transform: `translateY(${(1 - appear) * 20}px)` }}>
        {chunk.map((w, i) => {
          const active = t >= w.start && t <= w.end + 0.08
          const spoken = t >= w.start
          const pop = active
            ? interpolate(t, [w.start, w.start + 0.12], [1.16, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            : 1
          return (
            <span
              key={`${ci}-${i}`}
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 76,
                lineHeight: 1.05,
                transform: `scale(${pop})`,
                color: active ? NAVY : CREAM,
                background: active ? CREAM : 'transparent',
                padding: active ? '2px 18px' : '2px 4px',
                borderRadius: 16,
                opacity: spoken ? 1 : 0.42,
                textShadow: active ? 'none' : '0 5px 22px rgba(0,0,0,0.65)',
              }}
            >
              {w.word}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

function BrandWatermark() {
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: 46 }}>
      <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 30, color: CREAM, opacity: 0.82, letterSpacing: 0.5 }}>
        claimondo
      </div>
    </AbsoluteFill>
  )
}

// Outro-Bumper: die letzten ~1.1s blenden auf Navy + Marke + CTA.
function Outro({ total }: { total: number }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const start = total - 34
  if (f < start) return null
  const p = spring({ frame: f - start, fps, config: { damping: 15 } })
  const alpha = Math.round(Math.min(1, p) * 235)
    .toString(16)
    .padStart(2, '0')
  return (
    <AbsoluteFill style={{ background: `${NAVY}${alpha}`, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity: p, transform: `scale(${0.9 + p * 0.1})`, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 76, color: CREAM }}>claimondo</div>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: ACCENT, marginTop: 10 }}>Mehr auf claimondo.de</div>
      </div>
    </AbsoluteFill>
  )
}

export function ContentClip({ segments, audioSrc, durationInFrames }: ContentClipProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      <AnimatedBg />
      {segments.map((s, i) => {
        const dur = Math.max(1, s.endFrame - s.startFrame)
        return (
          <Sequence key={i} from={s.startFrame} durationInFrames={dur}>
            <VisualLayer visual={s.visual} segDuration={dur} />
            <Overlay text={s.on_screen_text} />
            <KineticCaption words={s.words} />
          </Sequence>
        )
      })}
      <BrandWatermark />
      <Outro total={durationInFrames} />
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  )
}
