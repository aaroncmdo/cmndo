// AAR-161 / W1: Fallakte SLA-Config — Timer-Werte für Eskalationen + Reminder.
//
// Zentrale Konstanten für alle Cron-Jobs und UI-Countdown-Timer im Fallakte-
// Bereich. Werte aus Notion-Spec 3431da4c9124814db2ecf2d7e613de03 +
// Subphasen-Matrix (Entscheidungen Aaron 15.04.2026) + LexDrive-SLA-Dokument.
//
// Alle Zeiten in Millisekunden. Helper für Werktage (WT) am Ende der Datei,
// die Kalendertage kennen kein „Werktag" — für WT-Rechnung nutzen Consumer
// `addWorkingDays()` oder die SLA-Tracker-Engine in lib/sla.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const SLA_CONFIG = {
  // ── Phase 2: Vollmacht-Reminder (Pfad A / Komplett) ──────────────────
  vollmacht: {
    /** Erste WA-Erinnerung nach SA-Unterschrift (2h). */
    reminderFirst: 2 * HOUR,
    /** Zweite Eskalations-WA (6h). */
    reminderSecond: 6 * HOUR,
    /** Hard-Limit bevor Fall auf Pending gesetzt wird. */
    hardLimit: 24 * HOUR,
  },

  // ── Phase 5: AS-Versand-SLA ──────────────────────────────────────────
  asVersand: {
    /**
     * 1–2 Werktage nach E-Akte-Übergabe an die Kanzlei. Consumer sollen
     * `minWorkingDays`/`maxWorkingDays` nehmen und in echte Kalender-Zeit
     * umrechnen (addWorkingDays in lib/sla).
     */
    minWorkingDays: 1,
    maxWorkingDays: 2,
  },

  // ── Phase 7: Technische Stellungnahme SV ─────────────────────────────
  technischeStellungnahme: {
    /** SLA: 3 WT = 72h nach Beauftragung. */
    deadlineHours: 72,
    /** WA-Reminder an SV nach 48h. */
    reminderWaAt: 48 * HOUR,
    /** KB-Eskalationstask nach 72h (deadline). */
    kbEskalationAt: 72 * HOUR,
  },

  // ── Phase 7: Rüge-Versand ────────────────────────────────────────────
  ruegeVersand: {
    /** 1–2 WT nach eingegangener techn. Stellungnahme. */
    minWorkingDaysAfterStellungnahme: 1,
    maxWorkingDaysAfterStellungnahme: 2,
  },

  // ── Phase 5/6: VS-Eskalation nach AS (bzw. Rüge) ─────────────────────
  vsEskalation: {
    /** Tag 14: Nachfass-Task an Kanzlei. */
    stufe1Days: 14,
    /** Tag 21: 1. Mahnung + Verzugszinsen. */
    stufe2Days: 21,
    /** Tag 28: 2. Mahnung + Klageandrohung. */
    stufe3Days: 28,
  },

  // ── Phase 6/Nachbesichtigung: Reminder-Intervall ─────────────────────
  nachbesichtigung: {
    /** Reminder wenn Kunde nach 48h keinen Slot gewählt hat. */
    kundenReminderAt: 48 * HOUR,
  },

  // ── Generisch: Task-Auto-Eskalation ──────────────────────────────────
  tasks: {
    /** Inaktiv-Alarm (FlowLink), siehe AAR-147 — hier gespiegelt. */
    flowlinkInaktivAt: 2 * HOUR,
    /** Task überfällig nach X Tagen ohne Bewegung. */
    taskOverdueAfterDays: 3,
  },
} as const

export type SlaKey = keyof typeof SLA_CONFIG

/**
 * Hilfs-Typ: liefert die Millisekunden-Dauer einer SLA-Konstante, wenn
 * eindeutig. Für WT-basierte SLAs (asVersand, ruegeVersand) returnt
 * `undefined` — Consumer soll dort `minWorkingDays` + `addWorkingDays`
 * aus dem SLA-Tracker nutzen.
 */
export function getSlaDeadlineMs(key: string): number | undefined {
  switch (key) {
    case 'vollmacht.reminderFirst':
      return SLA_CONFIG.vollmacht.reminderFirst
    case 'vollmacht.reminderSecond':
      return SLA_CONFIG.vollmacht.reminderSecond
    case 'vollmacht.hardLimit':
      return SLA_CONFIG.vollmacht.hardLimit
    case 'technischeStellungnahme.deadline':
      return SLA_CONFIG.technischeStellungnahme.deadlineHours * HOUR
    case 'technischeStellungnahme.reminderWa':
      return SLA_CONFIG.technischeStellungnahme.reminderWaAt
    case 'technischeStellungnahme.kbEskalation':
      return SLA_CONFIG.technischeStellungnahme.kbEskalationAt
    case 'nachbesichtigung.kundenReminder':
      return SLA_CONFIG.nachbesichtigung.kundenReminderAt
    case 'tasks.flowlinkInaktiv':
      return SLA_CONFIG.tasks.flowlinkInaktivAt
    case 'vsEskalation.stufe1':
      return SLA_CONFIG.vsEskalation.stufe1Days * DAY
    case 'vsEskalation.stufe2':
      return SLA_CONFIG.vsEskalation.stufe2Days * DAY
    case 'vsEskalation.stufe3':
      return SLA_CONFIG.vsEskalation.stufe3Days * DAY
    default:
      return undefined
  }
}
