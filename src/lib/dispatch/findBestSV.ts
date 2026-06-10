// AAR-50: Dispatch-Algorithmus — findBestSV
// Findet die besten Sachverständigen für einen Fall basierend auf:
// - Aktivität + nicht gesperrt
// - Urlaub-Check
// - Kontingent (Paket-Limit vs. genutzte Fälle)
// - Distanz (Isochrone oder Radius)
// - Paket-Prio (premium > pro > standard)
// - Balance (wenig offene Fälle bevorzugt)
// - Ablehnungsrate (wenig Ablehnungen bevorzugt)

import { findBestSVviaEngine } from './findBestSV-via-engine'

export type SvMatchInput = {
  fallLat: number
  fallLng: number
  terminDatum?: string // ISO-Datum optional (für Urlaub-Check)
  // AAR-264: Wunschtermin des Kunden — wenn gesetzt, prüfen wir pro SV ob er
  // im ±wunschterminFensterMin-Fenster bereits einen anderen Termin hat.
  wunschterminIso?: string | null
  wunschterminFensterMin?: number
  // Sticky-SV: bevorzuge diesen SV (kunde hatte ihn schon mal) — er bekommt
  // einen massiven Score-Bonus + "Sticky"-Reason-Badge, sonst normale Logik.
  stickySvId?: string | null
  // AAR-939 6b: bei der Verlegung den No-Show-SV aus dem Kandidaten-Set werfen.
  excludeSvId?: string | null
}

export type SvMatchCandidate = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  /** Echte Mapbox-Driving-ETA Büro → Fall in Minuten. null bei API-Fehler. */
  etaFromBueroMin: number | null
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  // Badge-Gründe für UI
  reasons: string[]
  // AAR-264: Wunschtermin-Verfügbarkeit (nur gesetzt wenn wunschterminIso übergeben)
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}

export const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
  basic: 0,
}

/**
 * Basic-SVs (paket='basic') haben kein Fall-Kontingent — sie werden rein
 * kalender-/verfuegbarkeitsbasiert beruecksichtigt und pro Lead abgerechnet.
 * Alle anderen Pakete: kein freies Kontingent => raus.
 */
export function istKontingentBlockiert(paket: string, kontingentFrei: number): boolean {
  if (paket === 'basic') return false
  return kontingentFrei <= 0
}

/**
 * AAR-50 Dispatch-Matching — seit Sub-A.3 ein Thin-Wrapper.
 *
 * Delegiert an die universelle Termin-Engine (`findeBestePerson` via
 * `findBestSVviaEngine`-Adapter). Signatur (`SvMatchInput` → `SvMatchCandidate[]`)
 * und Rueckgabe-Shape sind unveraendert → alle Consumer (Dispatch, Self-Service,
 * Verlegung) erben die Engine transparent. Aequivalenz im Shadow-Diff bewiesen
 * (PASS_TOP1, Top-1 3/3 identisch).
 */
export async function findBestSV(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  return findBestSVviaEngine(input, limit)
}
