// AAR-769 Phase 3 Batch 1: Shared-Avatar fuer Kunden/Kontakte mit
// Initials-Fallback. Wird in Chat-UI (FAB, Bubble, Inbox-Item) genutzt.
//
// Styling via Tone-Varianten. Kein Tailwind mehr — Inline-Styles aus
// Design-Tokens.

import { tokens } from '@/lib/design-tokens'

type KundeAvatarTone = 'navy-filled' | 'ondo-filled' | 'ondo-subtle'

type KundeAvatarProps = {
  name: string
  size?: number
  /** Tone-Variante. Default: navy-filled (navy bg + white text). */
  tone?: KundeAvatarTone
  /** Inline-Style-Override fuer Layout. */
  style?: React.CSSProperties
}

const TONE_MAP: Record<KundeAvatarTone, { bg: string; color: string }> = {
  'navy-filled': { bg: tokens.colors.navy, color: tokens.colors.white },
  'ondo-filled': { bg: tokens.colors.ondo, color: tokens.colors.white },
  'ondo-subtle': { bg: 'rgba(69, 115, 162, 0.1)', color: tokens.colors.ondo },
}

export function toInitials(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function KundeAvatar({
  name,
  size = 32,
  tone = 'navy-filled',
  style,
}: KundeAvatarProps) {
  const initials = toInitials(name)
  const fontSize = Math.max(10, Math.round(size * 0.38))
  const { bg, color } = TONE_MAP[tone]

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize,
        borderRadius: tokens.radius.full,
        backgroundColor: bg,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        flexShrink: 0,
        ...style,
      }}
      aria-label={name}
      title={name}
    >
      {initials || '?'}
    </div>
  )
}
