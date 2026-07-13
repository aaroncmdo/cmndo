/**
 * FG5 Cluster 5 — pure helper: derive reminder recency from abrechnung_reminders rows.
 * Replaces the stored duplicate abrechnungen.reminder_gesendet_am (Task 5a).
 */

/**
 * Returns the maximum (latest) versendet_am ISO string from the given reminder rows,
 * or null if the array is empty or all values are null.
 */
export function letzterReminderAm(
  reminders: Array<{ versendet_am: string | null }>,
): string | null {
  let max: string | null = null
  for (const r of reminders) {
    if (r.versendet_am === null) continue
    if (max === null || r.versendet_am > max) {
      max = r.versendet_am
    }
  }
  return max
}
