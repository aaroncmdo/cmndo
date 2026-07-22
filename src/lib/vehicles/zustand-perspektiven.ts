// B (Fahrzeug-Zustandsdoku) Task 2: Perspektiven-Set + Vollstaendigkeit + Badge-Ampel (pure).
// Enum-Werte == DDL-CHECK (vehicle_scan_fotos.perspektive) == Parser-/UI-Labels.

export const PFLICHT_PERSPEKTIVEN = [
  'front', 'heck', 'seite_links', 'seite_rechts', 'ecke_vl', 'ecke_vr', 'ecke_hl', 'ecke_hr',
] as const
export const OPTIONALE_PERSPEKTIVEN = ['tacho'] as const

export type Perspektive =
  | (typeof PFLICHT_PERSPEKTIVEN)[number]
  | (typeof OPTIONALE_PERSPEKTIVEN)[number]
  | 'nahaufnahme'

export const PERSPEKTIVE_LABEL: Record<string, string> = {
  front: 'Front',
  heck: 'Heck',
  seite_links: 'Seite links',
  seite_rechts: 'Seite rechts',
  ecke_vl: 'Ecke vorne links',
  ecke_vr: 'Ecke vorne rechts',
  ecke_hl: 'Ecke hinten links',
  ecke_hr: 'Ecke hinten rechts',
  tacho: 'Tacho (Kilometerstand)',
  nahaufnahme: 'Nahaufnahme',
}

/** true nur wenn jede Pflicht-Perspektive mindestens ein Foto hat. */
export function alleErfasst(erfasst: string[]): boolean {
  const s = new Set(erfasst)
  return PFLICHT_PERSPEKTIVEN.every((p) => s.has(p))
}

export type BadgeAmpel = 'gruen' | 'amber' | 'rot'

/** Ampel nach Monaten seit dem letzten abgeschlossenen Scan. null (nie) -> rot. */
export function badgeAmpel(monateSeitLetztemScan: number | null): BadgeAmpel {
  if (monateSeitLetztemScan == null) return 'rot'
  if (monateSeitLetztemScan < 3) return 'gruen'
  if (monateSeitLetztemScan <= 6) return 'amber'
  return 'rot'
}
