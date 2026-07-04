// AAR-769 Phase 3: Wrapper über <Badge>-Primitive.
//
// Dual-Mode (Status-Registry, W0):
//   • Registry-Modus: <StatusBadge domain="fall-status" code={s} role="kunde" />
//     → zieht Label+Slot-Farbe aus @/lib/status (Soft-Slot-Pille).
//   • Legacy-Modus: tone/colorCls/children wie bisher (unverändert).

import type { ReactNode } from 'react'
import { Badge } from '@/components/primitives'
import type { BadgeTone, BadgeSize } from '@/components/primitives/Badge/Badge.types'
import { statusBadgeView, statusIcon, type DomainName, type ViewerRole } from '@/lib/status'

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

// Soft-Slot-Pille (Registry-Modus): gleiche Grössen-Skala wie der colorCls-Pfad.
const REGISTRY_SIZE_CLS: Record<'xs' | 'sm', string> = {
  xs: 'text-[10px] px-2 py-0.5',
  sm: 'text-xs px-2.5 py-1',
}

type StatusBadgeProps = {
  // ── Registry-Modus ──
  /** Registry-Domain — aktiviert den Registry-Pfad (Label+Slot-Farbe aus @/lib/status). */
  domain?: DomainName
  /** Status-Code innerhalb der Domain. */
  code?: string | null
  /** Rollen-Variante (labelByRole), z.B. 'kunde'. */
  role?: ViewerRole
  /** Icon links neben Label rendern (falls die Domain einen iconKey hat). */
  withIcon?: boolean
  // ── Legacy-Modus ──
  tone?: StatusBadgeTone
  /** Eigene Tailwind-Klassen — überschreiben tone. Nützlich für Edge-Cases. */
  colorCls?: string
  children?: ReactNode
  // ── Gemeinsam ──
  size?: 'xs' | 'sm'
  className?: string
}

export function StatusBadge({
  domain,
  code,
  role,
  withIcon = false,
  tone = 'neutral',
  size = 'xs',
  colorCls,
  className = '',
  children,
}: StatusBadgeProps) {
  // ── Registry-Modus ── Label + Slot-Farbe aus @/lib/status (Soft-Slot-Pille).
  if (domain) {
    const { label, slotClass, iconKey } = statusBadgeView(domain, code, role)
    const Icon = withIcon ? statusIcon(iconKey) : null
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${REGISTRY_SIZE_CLS[size]} ${slotClass} ${className}`}
      >
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
    )
  }

  // ── Legacy Escape-Hatch: eigene Tailwind-Klassen → eigener Span. Hält Backward-
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

  // ── Legacy Standard-Pfad: <Badge> aus Primitives.
  // className-Prop wird ignoriert (Badge-Primitive hat keine className-API),
  // wird aber bewusst akzeptiert um Aufrufer-Signaturen nicht zu brechen.
  void className
  return (
    <Badge tone={TONE_TO_BADGE[tone]} size={SIZE_TO_BADGE[size]}>
      {children}
    </Badge>
  )
}
