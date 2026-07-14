// ARCH-1 POLISH Befund 1: zentrale Definition der SV-Status-Badges.
// Wird sowohl im Listing (KarteClient Sidebar) als auch im Detail-View
// verwendet, damit die Logik nicht zweimal driftet.

export type SvStatusKey =
  | 'wartet_auf_vertrag'
  | 'wartet_auf_anzahlung'
  | 'wartet_auf_freigabe'
  | 'aktiv'
  | 'gesperrt'

export type SvStatusInputs = {
  portal_zugang_freigeschaltet: boolean | null | undefined
  vertrag_unterschrieben: boolean | null | undefined
  gesperrt_seit: string | null | undefined
  // paket='basic' zahlt keine Anzahlung — einziges Gate ist die Team-Freigabe.
  // Optional, damit Alt-Aufrufer (ohne paket) sich weiter wie bezahlt verhalten.
  paket?: string | null | undefined
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
  // Basic-Tier: kein Anzahlungs-Schritt, wartet nur auf die manuelle Team-Freigabe.
  // Token-Klassen (info) statt roher Scale — Status-Ratchet-safe (src/** wird gescannt).
  wartet_auf_freigabe: {
    key: 'wartet_auf_freigabe',
    label: 'Wartet auf Freigabe',
    bg: 'bg-info-soft',
    text: 'text-info-strong',
    dot: 'bg-info',
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
 *  - gesperrt_seit IS NOT NULL                                          → Gesperrt
 *  - portal_zugang_freigeschaltet=true                                  → Aktiv
 *  - paket='basic' (Portal noch zu)                                     → Wartet auf Freigabe
 *  - portal_zugang_freigeschaltet=false UND vertrag_unterschrieben=true → Wartet auf Anzahlung
 *  - portal_zugang_freigeschaltet=false UND vertrag_unterschrieben=false → Wartet auf Vertrag
 *
 * Basic-Sonderfall vor der Vertrag/Anzahlung-Weiche: paket='basic' kennt keine
 * Anzahlung (preis=0, siehe BASIC_PAKET in lib/pakete.ts). Solange das Portal
 * nicht freigeschaltet ist, ist das einzige Gate die manuelle Team-Freigabe —
 * unabhaengig davon, ob der Basic-SV den Vertrag schon signiert hat.
 */
export function getSvStatus(input: SvStatusInputs): SvStatusBadge {
  if (input.gesperrt_seit) return SV_STATUS_BADGES.gesperrt
  if (input.portal_zugang_freigeschaltet) return SV_STATUS_BADGES.aktiv
  if (input.paket === 'basic') return SV_STATUS_BADGES.wartet_auf_freigabe
  if (input.vertrag_unterschrieben) return SV_STATUS_BADGES.wartet_auf_anzahlung
  return SV_STATUS_BADGES.wartet_auf_vertrag
}

export const SV_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: SvStatusKey | 'alle'; label: string }> = [
  { value: 'alle', label: 'Alle' },
  { value: 'wartet_auf_vertrag', label: 'Wartet auf Vertrag' },
  { value: 'wartet_auf_anzahlung', label: 'Wartet auf Anzahlung' },
  { value: 'wartet_auf_freigabe', label: 'Wartet auf Freigabe' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'gesperrt', label: 'Gesperrt' },
]
