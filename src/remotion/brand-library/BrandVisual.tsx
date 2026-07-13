// Token-Audit-Skip: Remotion-Compositions rendern headless (kein Tailwind/CSS-Var-Kontext)
//   -> Marken-Hex literal noetig, analog PDF-/Email-Generation. Siehe AGENTS.md §branding-rules.
import type { FC } from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'
import type { BrandKey } from './keys'

const NAVY = '#0D1B3E'
const CREAM = '#F5F1E8'
const WARN_RED = '#E4572E' // Marken-Icon-Rot (Nicht-Status)
const PLATE_BLUE = '#1E3A8A'
const PLATE_GOLD = '#F5C518'

function Warndreieck() {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: f, fps, config: { damping: 12 } })
  const pulse = interpolate(f % 44, [0, 22, 44], [1, 1.05, 1])
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          transform: `scale(${enter * pulse})`,
          width: 0,
          height: 0,
          borderLeft: '170px solid transparent',
          borderRight: '170px solid transparent',
          borderBottom: `300px solid ${WARN_RED}`,
          filter: 'drop-shadow(0 16px 48px rgba(0,0,0,0.45))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          transform: 'translateY(60px)',
          width: 0,
          height: 0,
          borderLeft: '120px solid transparent',
          borderRight: '120px solid transparent',
          borderBottom: `210px solid ${NAVY}`,
        }}
      />
    </AbsoluteFill>
  )
}

function Kennzeichen() {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: f, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          transform: `scale(${0.9 + s * 0.1})`,
          display: 'flex',
          height: 200,
          borderRadius: 18,
          overflow: 'hidden',
          border: '7px solid #111',
          background: '#fff',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            width: 78,
            background: PLATE_BLUE,
            color: PLATE_GOLD,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '12px 0',
            fontWeight: 800,
            fontSize: 34,
            fontFamily: 'sans-serif',
          }}
        >
          D
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 34px',
            fontSize: 128,
            fontWeight: 800,
            letterSpacing: 10,
            color: '#111',
            fontFamily: 'sans-serif',
          }}
        >
          K·MO
        </div>
      </div>
    </AbsoluteFill>
  )
}

const COMPONENTS: Record<BrandKey, FC> = {
  warndreieck: Warndreieck,
  kennzeichen: Kennzeichen,
}

export function BrandVisual({ brandKey }: { brandKey: string }) {
  const Comp = COMPONENTS[brandKey as BrandKey]
  if (!Comp) return null
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <Comp />
    </AbsoluteFill>
  )
}
