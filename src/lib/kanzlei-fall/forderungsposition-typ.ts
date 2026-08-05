// GEO-P2 SP1: zentrale typ->Label-Map für forderungspositionen.
// Werte MÜSSEN synchron zum DB-CHECK forderungspositionen_typ_check sein
// (Migration 20260804224244) — der Test hält das durch.
// Kein 'use server' (pure const) — darf von Client-Components importiert werden.

export const FORDERUNGSPOSITION_TYP_LABEL: Record<string, string> = {
  reparatur: 'Reparaturkosten',
  stundenverrechnung: 'Stundenverrechnungssätze',
  upe: 'UPE-Aufschläge',
  verbringung: 'Verbringungskosten',
  beilackierung: 'Beilackierung',
  wertminderung: 'Wertminderung',
  nutzungsausfall: 'Nutzungsausfall',
  mietwagen: 'Mietwagen',
  gutachterkosten: 'Sachverständigen-Honorar',
  abschleppkosten: 'Abschleppkosten',
  anwaltskosten: 'Anwaltskosten',
  kostenpauschale: 'Kostenpauschale',
  schmerzensgeld: 'Schmerzensgeld',
  wbw: 'Wiederbeschaffungswert',
  restwert: 'Restwert',
  sonstiges: 'Sonstiges',
}

/** Die bei VS-Kürzungen häufigen Positionen zuerst (Dropdown-Reihenfolge im Subform). */
export const KUERZBARE_POSITIONEN: string[] = [
  'stundenverrechnung',
  'upe',
  'verbringung',
  'beilackierung',
  'wertminderung',
  'nutzungsausfall',
  'mietwagen',
  'gutachterkosten',
  'reparatur',
  'sonstiges',
]

export function forderungspositionTypLabel(typ: string | null | undefined): string {
  if (!typ) return '—'
  return FORDERUNGSPOSITION_TYP_LABEL[typ] ?? typ
}
