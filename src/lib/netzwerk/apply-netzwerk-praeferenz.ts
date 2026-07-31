// Netzwerk-Boost, Ebene 2 (relational). Reine, DB-freie Stable-Partition: qualifizierte
// Freunde des Owners nach oben, Reihenfolge INNERHALB beider Gruppen unveraendert
// ("Freund oben, Wahl frei", Design §5.2/§6). Die Owner-/Freund-Aufloesung (DB, batched)
// liegt beim Consumer (K10). Leeres Set -> exakt dieselbe Referenz zurueck (No-op).
export function applyNetzwerkPraeferenz<T extends { id: string; qualifiziert: boolean }>(
  kandidaten: T[],
  freundKandidatIds: ReadonlySet<string>,
): (T & { imNetzwerk?: boolean })[] {
  if (freundKandidatIds.size === 0) return kandidaten
  const freundeOben: (T & { imNetzwerk: true })[] = []
  const rest: T[] = []
  for (const k of kandidaten) {
    if (k.qualifiziert && freundKandidatIds.has(k.id)) freundeOben.push({ ...k, imNetzwerk: true })
    else rest.push(k)
  }
  return [...freundeOben, ...rest]
}
