import type { Gewerk, Reparaturbedarf, Fit } from './types'
import { computeFit } from './fit'

export const HART_SCHWELLE = 60
export const MIN_TREFFER = 1

export type Qualifiziert<T> = T & { fit: Fit }
export type QualifizierungsErgebnis<T> = {
  werkstaetten: Qualifiziert<T>[]
  keineSpezialisierte: boolean // Hart-Modus, aber 0 Treffer -> Fallback (alle gezeigt)
  hartGefiltert: boolean
}

/**
 * 3-Zustand-Qualifizierung, confidence-gated. Erwartet distanz-sortierte rows;
 * die stabile Sortierung erhaelt die Distanz-Reihenfolge innerhalb einer fit-Gruppe.
 *
 * Inc-3: verifiziert optionales Feld — Sekundaer-Sort innerhalb der fit-Gruppen
 * im hart-Pfad. Bestands-Rows ohne verifiziert-Feld (undefined) werden wie
 * unverifiziert behandelt (kein Reorder gegenueber Inc-1).
 */
export function qualifiziereWerkstaetten<T extends { faehigkeiten: Gewerk[] | string[] | null; verifiziert?: boolean }>(
  rows: T[],
  bedarf: Reparaturbedarf,
): QualifizierungsErgebnis<T> {
  const annotated: Qualifiziert<T>[] = rows.map((r) => ({ ...r, fit: computeFit(r.faehigkeiten, bedarf.kategorien) }))
  const hart = bedarf.confidence >= HART_SCHWELLE && bedarf.kategorien.length > 0
  if (!hart) return { werkstaetten: annotated, keineSpezialisierte: false, hartGefiltert: false }

  const sichtbar = annotated.filter((r) => r.fit !== 'passt_nicht')
  if (sichtbar.length >= MIN_TREFFER) {
    const rang = (f: Fit) => (f === 'passt' ? 0 : 1)
    const vRang = (v?: boolean) => (v ? 0 : 1)
    // Primaer: fit-Rang; Sekundaer: verifiziert-Rang; stabil => Distanz bleibt je (fit,verifiziert)-Gruppe
    const sortiert = [...sichtbar].sort((a, b) => (rang(a.fit) - rang(b.fit)) || (vRang(a.verifiziert) - vRang(b.verifiziert)))
    return { werkstaetten: sortiert, keineSpezialisierte: false, hartGefiltert: true }
  }
  return { werkstaetten: annotated, keineSpezialisierte: true, hartGefiltert: false }
}
