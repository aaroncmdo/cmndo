// AAR-430: Reminder-Kaskaden pro Priorität. Statische Config, keine DB-Calls.
const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

export type ReminderKanal = 'system' | 'system+whatsapp' | 'system+whatsapp+email'

export type ReminderEntry = {
  typ: string
  /** Offset in ms relativ zu faellig_am. Negativ = vor Deadline, positiv = nach Deadline. */
  offset: number
  kanal: ReminderKanal
}

export const REMINDER_KASKADEN: Record<'normal' | 'dringend' | 'kritisch', ReminderEntry[]> = {
  normal: [
    { typ: 'pre_24h', offset: -24 * HOUR, kanal: 'system' },
    { typ: 'pre_2h',  offset: -2 * HOUR,  kanal: 'system' },
  ],
  dringend: [
    { typ: 'pre_6h',     offset: -6 * HOUR, kanal: 'system' },
    { typ: 'pre_1h',     offset: -1 * HOUR, kanal: 'system' },
    { typ: 'overdue_2h', offset: 2 * HOUR,  kanal: 'system+whatsapp' },
  ],
  kritisch: [
    { typ: 'pre_2h',      offset: -2 * HOUR, kanal: 'system+whatsapp' },
    { typ: 'pre_30min',   offset: -30 * MIN, kanal: 'system+whatsapp' },
    { typ: 'overdue_2h',  offset: 2 * HOUR,  kanal: 'system+whatsapp+email' },
    { typ: 'overdue_24h', offset: 24 * HOUR, kanal: 'system+whatsapp+email' },
  ],
}
