import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from 'remotion'

// PoC-Hex (Claimondo Navy / Akzent / Creme). In Teil B: echte design-tokens.
const NAVY = '#0D1B3E'
const ACCENT = '#4573A2'
const CREAM = '#F5F1E8'

function AnimatedBg() {
  const f = useCurrentFrame()
  const shift = interpolate(f % 240, [0, 240], [0, 30])
  return (
    <AbsoluteFill
      style={{ background: `radial-gradient(120% 120% at ${20 + shift}% 0%, ${ACCENT}33, ${NAVY})` }}
    />
  )
}

function Overlay({ text }) {
  const f = useCurrentFrame()
  const y = interpolate(f, [0, 12], [40, 0], { extrapolateRight: 'clamp' })
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  if (!text) return null
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 210 }}>
      <div
        style={{
          transform: `translateY(${y}px)`,
          opacity: o,
          background: NAVY,
          color: CREAM,
          padding: '16px 28px',
          borderRadius: 24,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 44,
          maxWidth: 900,
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  )
}

function KineticCaption({ words = [] }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = f / fps
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingLeft: 80, paddingRight: 80, paddingBottom: 360 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {words.map((w, i) => {
          const on = t >= w.start && t <= w.end + 0.15
          return (
            <span
              key={i}
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 800,
                fontSize: 66,
                lineHeight: 1.1,
                color: on ? CREAM : 'rgba(255,255,255,0.6)',
                transform: on ? 'scale(1.08)' : 'scale(1)',
                textShadow: '0 4px 24px rgba(0,0,0,0.55)',
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

export function ContentClip({ segments = [], audioPath }) {
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      <AnimatedBg />
      {segments.map((s, i) => (
        <Sequence key={i} from={s.startFrame} durationInFrames={Math.max(1, s.endFrame - s.startFrame)}>
          {s.brollPath ? (
            <OffthreadVideo
              src={staticFile(s.brollPath)}
              muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
            />
          ) : null}
          <Overlay text={s.on_screen_text} />
          <KineticCaption words={s.words} />
        </Sequence>
      ))}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}
    </AbsoluteFill>
  )
}
