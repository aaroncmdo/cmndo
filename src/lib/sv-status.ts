// ARCH-1 POLISH Befund 1: zentrale Definition der SV-Status-Badges.
// Wird sowohl im Listing (KarteClient Sidebar) als auch im Detail-View
// verwendet, damit die Logik nicht zweimal driftet.

export type SvStatusKey = 'wartet_auf_vertrag' | 'wartet_auf_anzahlung' | 'aktiv' | 'gesperrt'

export type SvStatusInputs = {
  portal_zugang_freigeschaltet: boolean | null | undefined
  vertrag_unterschrieben: boolean | null | undefined
  gesperrt_seit: string | null | undefined
}

export type SvStatusBadge = {
  key: SvStatusKey
  label: string
  // Tailwind classes (light style — passt zum existing Listing-Look)
  bg: string
  text: string
  dot: string
}

export const SV_STATUS_BADGES: Record<SvStatusKey, SvStatusBadge> = {
  wartet_auf_vertrag: {
    key: 'wartet_auf_vertrag',
    label: 'Wartet auf Vertrag',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    dot: 'bg-yellow-400',
  },
  wartet_auf_anzahlung: {
    key: 'wartet_auf_anzahlung',
    label: 'Wartet auf Anzahlung',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-400',
  },
  aktiv: {
    key: 'aktiv',
    label: 'Aktiv',
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  gesperrt: {
    key: 'gesperrt',
    label: 'Gesperrt',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
}

/**
 * Reihenfolge wichtig — gesperrt ueberlagert alles, dann Aktiv-Check, dann
 * unterschieden zwischen 'noch kein Vertrag' und 'Vertrag da, aber Anzahlung offen'.
 *
 * Quelle: ARCH-1 POLISH Befund 1
 *  - portal_zugang_freigeschaltet=false UND vertrag_unterschrieben=false → Wartet auf Vertrag
 *  - portal_zugang_freigeschaltet=false UND vertrag_unterschrieben=true  → Wartet auf Anzahlung
 *  - portal_zugang_freigeschaltet=true                                  → Aktiv
 *  - gesperrt_seit IS NOT NULL                                          → Gesperrt
 */
export function getSvStatus(input: SvStatusInputs): SvStatusBadge {
  if (input.gesperrt_seit) return SV_STATUS_BADGES.gesperrt
  if (input.portal_zugang_freigeschaltet) return SV_STATUS_BADGES.aktiv
  if (input.vertrag_unterschrieben) return SV_STATUS_BADGES.wartet_auf_anzahlung
  return SV_STATUS_BADGES.wartet_auf_vertrag
}

export const SV_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: SvStatusKey | 'alle'; label: string }> = [
  { value: 'alle', label: 'Alle' },
  { value: 'wartet_auf_vertrag', label: 'Wartet auf Vertrag' },
  { value: 'wartet_auf_anzahlung', label: 'Wartet auf Anzahlung' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'gesperrt', label: 'Gesperrt' },
]
