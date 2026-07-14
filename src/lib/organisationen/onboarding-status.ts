// P1 (Detail-View-Konsistenz): EINE Quelle fuer Label + Farbe des
// organisationen.onboarding_status.
//
// Vorher lag die Map inline in OrganisationenClient. Die neue Detail-View haette
// sie ein zweites Mal gebraucht -> Liste und Detail waeren auseinandergelaufen
// (die Liste kennt 5 Stufen, ein naiver aktiv/sonst-Ternary nur 2). Genau die
// Inkonsistenz, die dieses Programm beseitigen soll.
//
// Liegt bewusst in src/lib/ (nicht src/app|components) — zentrale Status-Maps
// sind dort per Konvention zuhause (AGENTS.md §Status-Registry-Gate).

import { CheckCircleIcon, ClockIcon, AlertCircleIcon, type LucideIcon } from 'lucide-react'

export type OrgOnboardingBadge = {
  label: string
  /** Token-gebundene Farbklassen fuer <StatusBadge colorCls=…>. */
  colorCls: string
  Icon: LucideIcon
}

const BADGES: Record<string, OrgOnboardingBadge> = {
  aktiv: { label: 'Aktiv', colorCls: 'bg-success-soft text-success-strong', Icon: CheckCircleIcon },
  pending: { label: 'Pending', colorCls: 'bg-warning-soft text-warning-strong', Icon: ClockIcon },
  vertrag_unterzeichnet: {
    label: 'Vertrag',
    colorCls: 'bg-claimondo-bg text-claimondo-ondo',
    Icon: ClockIcon,
  },
  anzahlung_offen: {
    label: 'Anzahlung offen',
    colorCls: 'bg-warning-soft text-warning-strong',
    Icon: AlertCircleIcon,
  },
  blockiert: {
    label: 'Blockiert',
    colorCls: 'bg-danger-soft text-danger-strong',
    Icon: AlertCircleIcon,
  },
}

/** Unbekannter Status faellt auf "pending" zurueck (nie leer rendern). */
export function orgOnboardingBadge(status: string | null | undefined): OrgOnboardingBadge {
  return (status ? BADGES[status] : undefined) ?? BADGES.pending
}
