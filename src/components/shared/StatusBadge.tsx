// AAR-769 Phase 3: Wrapper über <Badge>-Primitive.
//
// Bestehende Consumer-API (tone, size, colorCls, className, children) bleibt
// unverändert. Wenn `colorCls` gesetzt ist, rendert ein eigener Span mit
// Tailwind-Klassen (Escape-Hatch für Edge-Cases wie Org-Typen oder Anforde-
// rungen mit Hex-Farben). Sonst delegiert an <Badge> aus den Primitives.

import type { ReactNode } from 'react'
import { Badge } from '@/components/primitives'
import type { BadgeTone, BadgeSize } from '@/components/primitives/Badge/Badge.types'

export type StatusBadgeTone =
  | 'neutral'    // grau — unbekannt/default
  | 'info'       // blau — informativ
  | 'success'    // grün — erfolgreich/bezahlt/bestätigt
  | 'warning'    // amber — Achtung/pending
  | 'danger'     // rose — Fehler/abgelehnt/storniert
  | 'brand'      // claimondo-navy — primäre Aktion
  | 'ondo'       // claimondo-ondo — sekundäre Aktion/aktiv

// Mapping auf <Badge>-Tones (brand → navy).
const TONE_TO_BADGE: Record<StatusBadgeTone, BadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  brand: 'navy',
  ondo: 'ondo',
}

// xs → sm (18px), sm → md (22px) im neuen Badge.
const SIZE_TO_BADGE: Record<'xs' | 'sm', BadgeSize> = {
  xs: 'sm',
  sm: 'md',
}

type StatusBadgeProps = {
  tone?: StatusBadgeTone
  size?: 'xs' | 'sm'
  /** Eigene Tailwind-Klassen — überschreiben tone. Nützlich für Edge-Cases. */
  colorCls?: string
  className?: string
  children: ReactNode
}

export function StatusBadge({
  tone = 'neutral',
  size = 'xs',
  colorCls,
  className = '',
  children,
}: StatusBadgeProps) {
  // Escape-Hatch: eigene Tailwind-Klassen → eigener Span. Hält Backward-
  // Compat für AbrechnungenListClient, OrganisationenClient, AnforderungenListe
  // u. ä., wo die Farben aus DB-/Config-Maps kommen.
  if (colorCls) {
    const sizeCls = size === 'xs'
      ? 'text-[10px] px-2 py-0.5'
      : 'text-xs px-2.5 py-1'
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeCls} ${colorCls} ${className}`}
      >
        {children}
      </span>
    )
  }

  // Standard-Pfad: <Badge> aus Primitives.
  // className-Prop wird ignoriert (Badge-Primitive hat keine className-API),
  // wird aber bewusst akzeptiert um Aufrufer-Signaturen nicht zu brechen.
  void className
  return (
    <Badge tone={TONE_TO_BADGE[tone]} size={SIZE_TO_BADGE[size]}>
      {children}
    </Badge>
  )
}
