// AAR-840: Phase-Mapping für claims.phase (11 Werte nach AAR-839)
//
// Single Source of Truth für Phase-Anzeige + Pipeline-Visualisierung.
// Phasen 0–6 sind aktiv (auto durch calc_claims_phase), Phasen 9_* sind
// manuelle Endzustände (durch markClaimAs*-Actions in AAR-840 gesetzt).

import type { LucideIcon } from 'lucide-react'
import {
  CircleIcon,
  InboxIcon,
  UserCheckIcon,
  CarFrontIcon,
  FileCheckIcon,
  WrenchIcon,
  PhoneCallIcon,
  CheckCircleIcon,
  XCircleIcon,
  ScaleIcon,
  PauseCircleIcon,
} from 'lucide-react'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

export type ClaimPhase =
  | '0_lead'
  | '1_neu'
  | '2_in_bearbeitung'
  | '3_gutachter_unterwegs'
  | '4_gutachten_fertig'
  | '5_in_reparatur'
  | '6_kommunikation_versicherung'
  | '9_reguliert'
  | '9_abgelehnt'
  | '9_an_externe_kanzlei'
  | '9_storniert'

type ClaimPhaseMapping = {
  /** Sortierreihenfolge auf der Pipeline (0..7); Endzustände kollabieren auf Position 7 */
  order: number
  /** Kurz, Admin-Sprache */
  label: string
  /** Kunde-freundlich */
  labelKunde: string
  tone: StatusBadgeTone
  icon: LucideIcon
  /** Endzustand: Pipeline endet hier (durchgezogen oder gestrichelt zum Endzustand-Icon) */
  isEndzustand: boolean
}

export const CLAIM_PHASE: Record<ClaimPhase, ClaimPhaseMapping> = {
  '0_lead': {
    order:        0,
    label:        'Lead',
    labelKunde:   'Schadenmeldung',
    tone:         'neutral',
    icon:         CircleIcon,
    isEndzustand: false,
  },
  '1_neu': {
    order:        1,
    label:        'Neu',
    labelKunde:   'Eingegangen',
    tone:         'info',
    icon:         InboxIcon,
    isEndzustand: false,
  },
  '2_in_bearbeitung': {
    order:        2,
    label:        'In Bearbeitung',
    labelKunde:   'Wird bearbeitet',
    tone:         'ondo',
    icon:         UserCheckIcon,
    isEndzustand: false,
  },
  '3_gutachter_unterwegs': {
    order:        3,
    label:        'Gutachter unterwegs',
    labelKunde:   'Gutachter unterwegs',
    tone:         'ondo',
    icon:         CarFrontIcon,
    isEndzustand: false,
  },
  '4_gutachten_fertig': {
    order:        4,
    label:        'Gutachten fertig',
    labelKunde:   'Gutachten erstellt',
    tone:         'ondo',
    icon:         FileCheckIcon,
    isEndzustand: false,
  },
  '5_in_reparatur': {
    order:        5,
    label:        'In Reparatur',
    labelKunde:   'Wird repariert',
    tone:         'ondo',
    icon:         WrenchIcon,
    isEndzustand: false,
  },
  '6_kommunikation_versicherung': {
    order:        6,
    label:        'VS-Kommunikation',
    labelKunde:   'Verhandlung mit Versicherung',
    tone:         'brand',
    icon:         PhoneCallIcon,
    isEndzustand: false,
  },
  '9_reguliert': {
    order:        7,
    label:        'Reguliert',
    labelKunde:   'Erfolgreich reguliert',
    tone:         'success',
    icon:         CheckCircleIcon,
    isEndzustand: true,
  },
  '9_abgelehnt': {
    order:        7,
    label:        'Abgelehnt',
    labelKunde:   'Abgelehnt',
    tone:         'danger',
    icon:         XCircleIcon,
    isEndzustand: true,
  },
  '9_an_externe_kanzlei': {
    order:        7,
    label:        'An Kanzlei',
    labelKunde:   'An deine Kanzlei übergeben',
    tone:         'brand',
    icon:         ScaleIcon,
    isEndzustand: true,
  },
  '9_storniert': {
    order:        7,
    label:        'Storniert',
    labelKunde:   'Gestoppt',
    tone:         'neutral',
    icon:         PauseCircleIcon,
    isEndzustand: true,
  },
}

export function getPhaseMapping(phase: string): ClaimPhaseMapping {
  return CLAIM_PHASE[phase as ClaimPhase] ?? {
    order:        0,
    label:        phase,
    labelKunde:   phase,
    tone:         'neutral',
    icon:         CircleIcon,
    isEndzustand: false,
  }
}

/** Aktive Phasen 0–6 in Pipeline-Reihenfolge (für PhasePipeline-Rendering) */
export const PIPELINE_PHASES: ClaimPhase[] = [
  '0_lead',
  '1_neu',
  '2_in_bearbeitung',
  '3_gutachter_unterwegs',
  '4_gutachten_fertig',
  '5_in_reparatur',
  '6_kommunikation_versicherung',
]
