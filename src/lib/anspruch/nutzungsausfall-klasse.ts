import type { Segment } from './types'

// Nutzungsausfall-Klassen (A-L, ohne "I" — wie in der amtlichen Nutzungsausfalltabelle ueblich,
// um Verwechslung mit "1" zu vermeiden).
export type NutzungsausfallKlasse = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L'

// Geordnete Reihe: Index 0 = kleinste/guenstigste Klasse. Altersabschlag = Schritt(e) Richtung A.
export const KLASSEN_REIHE: readonly NutzungsausfallKlasse[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L',
] as const

// Kanonische Tagessaetze (EUR/Tag) je Klasse. Source of truth im Code; die DB-Tabelle
// nutzungsausfall_klasse_saetze kann sie ohne Deploy uebersteuern (rates.ts liest DB mit diesem Fallback).
export const STANDARD_KLASSE_SAETZE: Record<NutzungsausfallKlasse, number> = {
  A: 23, B: 29, C: 35, D: 38, E: 43, F: 50, G: 59, H: 65, J: 79, K: 119, L: 175,
}

// Grobes KI-Segment -> repraesentative Nutzungsausfall-Basisklasse (vor Altersabschlag).
// suv -> J (Oberklasse SUV/Van), transporter -> G (Aaron 2026-07-08 bestaetigt).
export const SEGMENT_ZU_KLASSE: Record<Segment, NutzungsausfallKlasse> = {
  kleinwagen: 'B',
  kompakt: 'C',
  mittelklasse: 'E',
  oberklasse: 'G',
  suv: 'J',
  transporter: 'G',
}

// Altersabschlag: > 10 Jahre -> 2 Klassen runter, > 5 Jahre -> 1 Klasse runter, sonst 0.
export function altersRueckstufung(alterJahre: number | null): number {
  if (alterJahre == null) return 0
  if (alterJahre > 10) return 2
  if (alterJahre > 5) return 1
  return 0
}

export type KlasseErgebnis = {
  basis: NutzungsausfallKlasse // Basisklasse aus dem Segment (vor Abschlag)
  klasse: NutzungsausfallKlasse // finale Klasse (nach Abschlag + Clamp bei A)
  stufen: number // tatsaechlich angewandte Rueckstufung (nach Clamp; 0 wenn keine)
  satzEur: number // Tagessatz der finalen Klasse
}

// Bestimmt Nutzungsausfall-Klasse + Tagessatz fuer ein Fahrzeug (Segment + Alter).
export function bestimmeNutzungsausfallKlasse(
  segment: Segment,
  alterJahre: number | null,
  saetze: Record<NutzungsausfallKlasse, number> = STANDARD_KLASSE_SAETZE,
): KlasseErgebnis {
  const basis = SEGMENT_ZU_KLASSE[segment]
  const gewuenschteStufen = altersRueckstufung(alterJahre)
  const basisIdx = KLASSEN_REIHE.indexOf(basis)
  const finalIdx = Math.max(0, basisIdx - gewuenschteStufen)
  const klasse = KLASSEN_REIHE[finalIdx]
  return { basis, klasse, stufen: basisIdx - finalIdx, satzEur: saetze[klasse] }
}
