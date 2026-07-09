// 2026-07-08 (Aaron „kannst du es smoken?"): reine Interleaving-Logik des Privat-Stop-Features,
// aus feldmodus/page.tsx extrahiert damit sie deterministisch getestet werden kann (der Live-
// Feldmodus mit GPS/Geofence ist nicht headless-testbar, DIESE Logik schon).
//
// Regeln:
//  - Termine bleiben in ihrer Eingangs-Reihenfolge (Session-Reihenfolge).
//  - Jeder Privat-Wegpunkt wird VOR dem ersten Termin einsortiert, dessen start_zeit >= seiner
//    liegt (also „<=" -> zeitgleich = Privat zuerst). Verbleibende hinter den letzten Termin.
//  - Danach 0-basiert re-indexen.
//  - Ohne Privat-Stops == die unveraenderte termineStops-Liste (Termin-Flow unangetastet).

export function weavePrivatStops<T extends { start_zeit: string; index: number }>(
  termineStops: T[],
  privatStops: T[],
): T[] {
  if (privatStops.length === 0) return termineStops
  const priv = [...privatStops].sort(
    (a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime(),
  )
  const merged: T[] = []
  let pi = 0
  for (const t of termineStops) {
    const tMs = new Date(t.start_zeit).getTime()
    while (pi < priv.length && new Date(priv[pi].start_zeit).getTime() <= tMs) {
      merged.push(priv[pi++])
    }
    merged.push(t)
  }
  while (pi < priv.length) merged.push(priv[pi++])
  return merged.map((s, i) => ({ ...s, index: i }))
}
