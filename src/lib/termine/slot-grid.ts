// AAR-900: Termin-Slot-Grid-Builder. Extrahiert aus der bisherigen Inline-
// Implementierung in /kunde/re-termin/[token]/page.tsx (CMM-40), wird vom
// neuen TerminPicker-Shared-Component konsumiert.
//
// Erzeugt ein Tag×Stunde-Grid und filtert Slots die mit existierenden
// gutachter_termine kollidieren (Status != storniert/abgelehnt/abgesagt).

export const DEFAULT_SLOT_HOURS = [9, 11, 13, 15] as const
export const DEFAULT_SLOT_DURATION_HOURS = 1
export const DEFAULT_HORIZON_DAYS = 14

export type TerminSlot = {
  /** ISO-String der Slot-Startzeit. */
  startIso: string
  /** Lesbarer Tag-Header z.B. "Mo, 06.05." */
  tagLabel: string
  /** Lesbares Stunden-Label z.B. "09:00" */
  zeitLabel: string
  /** True wenn der Slot frei ist (kein Konflikt mit SV-Terminen). */
  available: boolean
  /** ISO date YYYY-MM-DD fuer Group-by-Tag. */
  dateKey: string
}

export type ExistingTermin = {
  start_zeit: string | null
  end_zeit: string | null
}

export type SlotGridOptions = {
  /** Anzahl Werktage ab morgen. Default 14. */
  horizonDays?: number
  /** Stunden an denen ein Slot beginnt. Default [9,11,13,15]. */
  slotHours?: readonly number[]
  /** Slot-Dauer in Stunden. Default 1. */
  slotDurationHours?: number
}

function formatTagLabel(d: Date): string {
  const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${wt}, ${dd}.${mm}.`
}

function nextWeekdays(count: number, startFrom: Date = new Date()): Date[] {
  const result: Date[] = []
  const cursor = new Date(startFrom)
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() + 1)
  while (result.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      result.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

/** Reine Funktion: erzeugt das Slot-Grid und markiert Konflikte mit
 *  existierenden Terminen (Pflicht-Konflikt wenn der Slot in den Termin
 *  hineinragt — egal welche Seite). */
export function buildSlotGrid(
  konflikte: ExistingTermin[],
  options: SlotGridOptions = {},
): TerminSlot[] {
  const horizon = options.horizonDays ?? DEFAULT_HORIZON_DAYS
  const hours = options.slotHours ?? DEFAULT_SLOT_HOURS
  const duration = options.slotDurationHours ?? DEFAULT_SLOT_DURATION_HOURS

  const tage = nextWeekdays(horizon)
  const slots: TerminSlot[] = []

  for (const tag of tage) {
    for (const h of hours) {
      const start = new Date(tag)
      start.setHours(h, 0, 0, 0)
      const end = new Date(start)
      end.setHours(h + duration)

      const startMs = start.getTime()
      const endMs = end.getTime()
      const conflict = konflikte.some((k) => {
        if (!k.start_zeit || !k.end_zeit) return false
        const kStart = new Date(k.start_zeit).getTime()
        const kEnd = new Date(k.end_zeit).getTime()
        return kStart < endMs && kEnd > startMs
      })

      const dateKey = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`

      slots.push({
        startIso: start.toISOString(),
        tagLabel: formatTagLabel(tag),
        zeitLabel: `${String(h).padStart(2, '0')}:00`,
        available: !conflict,
        dateKey,
      })
    }
  }
  return slots
}

/** Gruppiert Slots nach Tag — fuer das vertikal-Tag/horizontal-Zeit-Layout
 *  im TerminPicker. */
export function groupSlotsByDay(slots: TerminSlot[]): Array<{
  tagLabel: string
  dateKey: string
  slots: TerminSlot[]
}> {
  const map = new Map<string, { tagLabel: string; dateKey: string; slots: TerminSlot[] }>()
  for (const s of slots) {
    const entry = map.get(s.dateKey)
    if (entry) {
      entry.slots.push(s)
    } else {
      map.set(s.dateKey, { tagLabel: s.tagLabel, dateKey: s.dateKey, slots: [s] })
    }
  }
  return Array.from(map.values())
}
