// Welche Faelle "brauchen einen Blick": aktiv + nicht abgeschlossen + N Tage ohne Aktivitaet.
// Schwelle bewusst hier zentral (spaeter DB-Config).
export const STAGNATION = { tageSchwelle: 5 } as const

export function isStagnant(
  row: { istAktiv: boolean; abgeschlossenAm: string | null; letzteAktivitaetAm: string | null },
  now: Date,
): boolean {
  if (!row.istAktiv || row.abgeschlossenAm) return false
  if (!row.letzteAktivitaetAm) return true
  return (now.getTime() - new Date(row.letzteAktivitaetAm).getTime()) / 86400000 >= STAGNATION.tageSchwelle
}
