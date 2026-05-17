// AAR-764: Event → Task Spec Map.
//
// Wenn ein Event via `emitEvent()` (lib/notifications/emit.ts) gefeuert wird
// und hier ein Eintrag existiert, erstellt der Resolver automatisch einen
// oder mehrere Tasks mit Deadline + Reminder-Kaskade. So lebt die Logik
// "Event X triggert Task Y für Rolle Z" an einer Stelle statt in Ad-hoc
// Call-Sites.
//
// Template-Variablen in `titel_template` / `beschreibung_template`:
//   - {claim_nummer}, {vorname}, {nachname}, {kunde_name}
//   - {sv_name}, {kb_name}
//   - {betrag}, {frist}, {tage_rest}, {dokument_typ}
// Der Resolver löst sie aus Payload + angehängten Fall-Infos auf.

import type { EventType, Priority, Role, Channel } from '@/lib/notifications/types'
import type { TaskPrioritaet } from '@/lib/tasks/types'

export type ResolverReminderStep = {
  /** Offset-Stunden ab Task-Erstellung. */
  after_hours: number
  /** Kanal für den Reminder. Default: whatsapp. */
  channel?: Channel
}

export type ResolverEskalation = {
  /** Nach wie vielen Remindern ohne Task-Erledigung eskalieren. */
  nach_stillen_remindern: number
  /** Empfänger-Rolle des Eskalations-Tasks. */
  an_rolle: Role
  /** Titel-Template des Eskalations-Tasks. */
  titel_template: string
  prioritaet?: TaskPrioritaet
}

export type TaskSpec = {
  /** Task-Typ-Slug (in `tasks.task_typ`). */
  task_typ: string
  /** Titel mit Content-Variablen. */
  titel_template: string
  /** Optionale Langbeschreibung. */
  beschreibung_template?: string
  /** Empfänger-Rolle — Task-Assignee wird rolleweise via auto-assign gewählt. */
  empfaenger_rolle: Role
  /** Deadline in Stunden ab Task-Erstellung. */
  deadline_hours: number
  prioritaet?: TaskPrioritaet
  reminder_kaskade?: ResolverReminderStep[]
  eskalation?: ResolverEskalation
}

/**
 * Initial-Mapping. Wächst organisch mit den Feature-Tickets (AAR-759,
 * AAR-761, AAR-762). Neue Events werden hier ergänzt statt in Call-Site-
 * Logic.
 */
export const EVENT_TO_TASK: Partial<Record<EventType, TaskSpec[]>> = {
  // ─── 5.9 Dokumente ──────────────────────────────────────────────────
  'dokument.fehlt': [
    {
      task_typ: 'dokument_nachfordern',
      titel_template: 'Dokument nachfordern: {dokument_typ}',
      beschreibung_template:
        'Kunde {vorname} {nachname} hat {dokument_typ} noch nicht hochgeladen. Bitte erinnern oder manuell nachfordern.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 24,
      prioritaet: 'normal',
      reminder_kaskade: [
        { after_hours: 24, channel: 'whatsapp' },
        { after_hours: 72, channel: 'whatsapp' },
        { after_hours: 168, channel: 'email' },
      ],
      eskalation: {
        nach_stillen_remindern: 3,
        an_rolle: 'admin',
        titel_template: 'Eskalation: Dokument {dokument_typ} fehlt seit Tagen bei Fall {claim_nummer}',
        prioritaet: 'dringend',
      },
    },
  ],

  // ─── 5.8 Regulierung / VS ───────────────────────────────────────────
  'eskalation.vs_frist': [
    {
      task_typ: 'vs_eskalation_pruefen',
      titel_template: 'VS-Frist abgelaufen — Fall {claim_nummer} prüfen',
      beschreibung_template:
        'Die Versicherung hat die Frist überschritten. Bitte Sachlage prüfen und ggf. Rüge vorbereiten.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 4,
      prioritaet: 'dringend',
      reminder_kaskade: [{ after_hours: 4, channel: 'in_app' }],
      eskalation: {
        nach_stillen_remindern: 1,
        an_rolle: 'admin',
        titel_template: 'Admin-Eskalation: VS-Frist Fall {claim_nummer} nicht bearbeitet',
        prioritaet: 'kritisch',
      },
    },
  ],

  // ─── 5.2 SA / Vollmacht ─────────────────────────────────────────────
  'sa.flow_sent': [
    {
      task_typ: 'sa_unterschrift_pruefen',
      titel_template: 'SA-Unterschrift von {kunde_name} verfolgen',
      beschreibung_template:
        'Kunde hat SA-Flow-Link erhalten. Bitte nach 48h prüfen ob unterschrieben.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 48,
      prioritaet: 'normal',
      reminder_kaskade: [{ after_hours: 48, channel: 'in_app' }],
    },
  ],

  // ─── 5.5 Gutachten ──────────────────────────────────────────────────
  'gutachten.nachbesserung': [
    {
      task_typ: 'gutachten_nachbessern',
      titel_template: 'Gutachten Fall {claim_nummer} nachbessern',
      beschreibung_template:
        'QC hat Nachbesserungs-Bedarf gemeldet. Bitte Gutachten überarbeiten und erneut hochladen.',
      empfaenger_rolle: 'sachverstaendiger',
      deadline_hours: 72,
      prioritaet: 'dringend',
      reminder_kaskade: [
        { after_hours: 24, channel: 'whatsapp' },
        { after_hours: 48, channel: 'whatsapp' },
      ],
      eskalation: {
        nach_stillen_remindern: 2,
        an_rolle: 'admin',
        titel_template: 'SV reagiert nicht auf QC-Nachbesserung — Fall {claim_nummer}',
        prioritaet: 'dringend',
      },
    },
  ],

  // ─── 5.6 Kanzlei ────────────────────────────────────────────────────
  'kanzlei.uebergabe': [
    {
      task_typ: 'kanzlei_paket_zusammenstellen',
      titel_template: 'Kanzlei-Paket für Fall {claim_nummer} zusammenstellen',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 48,
      prioritaet: 'normal',
    },
  ],

  // ─── 5.12 Mietwagen / Nutzungsausfall (AAR-759) ─────────────────────
  'mietwagen.rechnung_ausstehend': [
    {
      task_typ: 'mietwagen_rechnung_einholen',
      titel_template: 'Mietwagen-Rechnung von Kunde {vorname} einholen',
      beschreibung_template:
        'Kunde hat Mietwagen seit {seit_tage} Tagen. Bitte Rechnung anfordern und prüfen.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 48,
      prioritaet: 'normal',
      reminder_kaskade: [
        { after_hours: 24, channel: 'whatsapp' },
        { after_hours: 72, channel: 'whatsapp' },
      ],
      eskalation: {
        nach_stillen_remindern: 3,
        an_rolle: 'admin',
        titel_template: 'Eskalation: Mietwagen-Rechnung für Fall {claim_nummer} seit Tagen offen',
        prioritaet: 'dringend',
      },
    },
  ],
  'mietwagen.abgabe_naht': [
    {
      task_typ: 'mietwagen_abgabe_steuern',
      titel_template: 'Mietwagen-Abgabe naht: Kunde {vorname} — noch {tage_rest} Tage',
      beschreibung_template:
        'Bitte Kunden kontaktieren und Abgabe am Limit-Datum bestätigen. VS-Puffer beachten.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 24,
      prioritaet: 'dringend',
      reminder_kaskade: [{ after_hours: 12, channel: 'in_app' }],
    },
  ],
  'mietwagen.ueber_limit': [
    {
      task_typ: 'mietwagen_kunde_eigene_kosten',
      titel_template: 'Mietwagen über Limit — Kunde {vorname} fährt auf eigene Kosten',
      beschreibung_template:
        'Limit seit {tage_ueber} Tagen überschritten. Argumentations-Puffer ausgeschöpft. Kunde hat Benachrichtigung erhalten.',
      empfaenger_rolle: 'kundenbetreuer',
      deadline_hours: 4,
      prioritaet: 'kritisch',
      eskalation: {
        nach_stillen_remindern: 1,
        an_rolle: 'admin',
        titel_template: 'Admin-Eskalation: Mietwagen-Überlimit Fall {claim_nummer}',
        prioritaet: 'kritisch',
      },
    },
  ],
}

/**
 * Hilfsfunktion für Consumer die pro Event nur den ersten Spec brauchen
 * (die meisten haben genau einen).
 */
export function getTaskSpecsForEvent(event: EventType): TaskSpec[] {
  return EVENT_TO_TASK[event] ?? []
}

/**
 * Mapping: interne Priority aus lib/notifications/types (low/normal/urgent)
 * auf TaskPrioritaet (normal/dringend/kritisch).
 */
export function eventPriorityToTask(p: Priority): TaskPrioritaet {
  switch (p) {
    case 'urgent':
      return 'kritisch'
    case 'low':
      return 'normal'
    default:
      return 'normal'
  }
}
