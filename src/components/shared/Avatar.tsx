// AAR-369 / AAR-769: Nur-Lese-Avatar mit Initialen-Fallback.
// Wird auf Kunden-Seite (Mein Betreuer, Meine Kanzlei, Gutachter-Karte) genutzt.
//
// AAR-769 Phase 3 Batch 1: Styling auf Design-Tokens umgestellt. Keine
// Tailwind-Klassen mehr — Inline-Styles via `tokens`. Dadurch ist die
// Component RN-kompatibel (bei spaeterem Port: nur <img> -> <Image>
// austauschen, Rest laeuft via StyleSheet).

import { tokens } from '@/lib/design-tokens'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

type Props = {
  url: string | null | undefined
  name: string | null | undefined
  size?: AvatarSize
  /** Inline-Style-Override fuer Layout (margin/positioning). Keine Farb-Overrides. */
  style?: React.CSSProperties
}

const SIZE_MAP: Record<AvatarSize, { diameter: number; fontSize: number }> = {
  xs: { diameter: 32, fontSize: 12 },
  sm: { diameter: 40, fontSize: 14 },
  md: { diameter: 56, fontSize: 16 },
  lg: { diameter: 80, fontSize: 24 },
}

function computeInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ url, name, size = 'md', style }: Props) {
  const { diameter, fontSize } = SIZE_MAP[size]

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? 'Profilbild'}
        style={{
          width: diameter,
          height: diameter,
          borderRadius: tokens.radius.full,
          objectFit: 'cover',
          backgroundColor: tokens.colors.bg,
          ...style,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: tokens.radius.full,
        backgroundColor: 'rgba(69, 115, 162, 0.1)', // ondo/10
        color: tokens.colors.navy,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize,
        ...style,
      }}
    >
      {computeInitials(name)}
    </div>
  )
}
