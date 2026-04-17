// AAR-431: Werktage-Helper. Mo–Fr, ohne Feiertage (einfach gehalten,
// Feiertage können später über einen DE-Feiertags-Check ergänzt werden).

/**
 * Addiert `days` Werktage (Mo–Fr) auf `date` und gibt ein neues Date zurück.
 * Wochenend-Tage werden übersprungen.
 */
export function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return result
}

/**
 * Berechnet die Anzahl Werktage zwischen zwei Daten (inkl. Endtag).
 * Nützlich für Stufen-Logik (Stufe 2 nach 3 WT, Stufe 3 nach 7 WT).
 */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let count = 0
  const cursor = new Date(from)
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1)
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}
