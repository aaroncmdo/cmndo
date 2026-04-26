// AAR-840: Status-Mapping für claims.status (7 Werte nach AAR-839)
//
// Single Source of Truth für Status-Anzeige. Wird konsumiert von:
//   - ClaimStatusBadge (Admin/SV/Kunde-Portal)
//   - EndzustandDropdown (Admin)
//   - TimelineView (AAR-843, via timeline-display.ts)

import type { LucideIcon } from 'lucide-react'
import {
  PlayCircleIcon,
  UserCheckIcon,
  PhoneCallIcon,
  CheckCircleIcon,
  XCircleIcon,
  ScaleIcon,
  PauseCircleIcon,
} from 'lucide-react'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

export type ClaimStatus =
  | 'dispatch_done'
  | 'in_bearbeitung'
  | 'in_kommunikation_vs'
  | 'reguliert'
  | 'abgelehnt'
  | 'an_externe_kanzlei_uebergeben'
  | 'storniert'

type ClaimStatusMapping = {
  /** Kurz, Admin-/Fach-Sprache */
  label: string
  /** Kunde-freundlich, gleicher String wenn keine Vereinfachung nötig */
  labelKunde: string
  tone: StatusBadgeTone
  icon: LucideIcon
  /** Endzustand: Status nach dem keine weitere Aktion mehr passiert */
  isEndzustand: boolean
}

export const CLAIM_STATUS: Record<ClaimStatus, ClaimStatusMapping> = {
  dispatch_done: {
    label:        'Neu',
    labelKunde:   'Neu eingegangen',
    tone:         'info',
    icon:         PlayCircleIcon,
    isEndzustand: false,
  },
  in_bearbeitung: {
    label:        'In Bearbeitung',
    labelKunde:   'In Bearbeitung',
    tone:         'ondo',
    icon:         UserCheckIcon,
    isEndzustand: false,
  },
  in_kommunikation_vs: {
    label:        'Kommunikation mit VS',
    labelKunde:   'Wir verhandeln mit der Versicherung',
    tone:         'brand',
    icon:         PhoneCallIcon,
    isEndzustand: false,
  },
  reguliert: {
    label:        'Reguliert',
    labelKunde:   'Reguliert',
    tone:         'success',
    icon:         CheckCircleIcon,
    isEndzustand: true,
  },
  abgelehnt: {
    label:        'Abgelehnt',
    labelKunde:   'Abgelehnt',
    tone:         'danger',
    icon:         XCircleIcon,
    isEndzustand: true,
  },
  an_externe_kanzlei_uebergeben: {
    label:        'An externe Kanzlei',
    labelKunde:   'An deine Kanzlei übergeben',
    tone:         'brand',
    icon:         ScaleIcon,
    isEndzustand: true,
  },
  storniert: {
    label:        'Storniert',
    labelKunde:   'Gestoppt',
    tone:         'neutral',
    icon:         PauseCircleIcon,
    isEndzustand: true,
  },
}

export function getStatusMapping(status: string): ClaimStatusMapping {
  return CLAIM_STATUS[status as ClaimStatus] ?? {
    label:        status,
    labelKunde:   status,
    tone:         'neutral',
    icon:         PlayCircleIcon,
    isEndzustand: false,
  }
}
