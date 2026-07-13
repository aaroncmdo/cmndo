// src/lib/task-executor/registry.ts
import type { TaskRow } from './types'

/** Erlaubte tasks.typ (v1). Button erscheint nur hier + wenn claim_id gesetzt + nicht erledigt.
 *  promptHint = was dieser Typ meist braucht. P2 ergaenzt dokument-pruefen (lese_dokument). */
export const EXECUTABLE_TYPES: Record<string, { label: string; promptHint: string }> = {
  sa_ausstehend: {
    label: 'SA ausstehend',
    promptHint:
      'Die Schadensanzeige ist noch nicht unterschrieben. Erinnere den Kunden freundlich per Template (sende_kommunikation) und halte das Ergebnis fest. Schliesse den Task, wenn die Erinnerung raus ist.',
  },
  allgemein: {
    label: 'Allgemein',
    promptHint:
      'Freeform-Aufgabe (oft ein Orchestrator-Vorschlag). Lies Titel + Beschreibung + Kontext und fuehre den naechsten sinnvollen Schritt aus. Wenn nur eine Analyse noetig ist, schreibe eine interne Notiz und schliesse den Task.',
  },
  'erster-kontakt': {
    label: 'Erster Kontakt',
    promptHint:
      'Erstkontakt mit dem Kunden herstellen. Wenn ein passendes Template existiert, sende es (sende_kommunikation); sonst halte den Versuch als Notiz fest.',
  },
  sla_breach: {
    label: 'SLA-Verletzung',
    promptHint:
      'Eine Frist wurde ueberschritten. Beurteile aus dem Kontext, ob eine konkrete Aktion moeglich ist (Erinnerung senden, Status setzen) — sonst dokumentiere den Stand als interne Notiz. Eskaliere nicht blind.',
  },
}

export function executableTypeFor(task: Pick<TaskRow, 'typ' | 'claim_id' | 'status'>) {
  if (!task.typ) return null
  if (!task.claim_id) return null
  if (task.status === 'erledigt') return null
  return EXECUTABLE_TYPES[task.typ] ?? null
}

export const EXECUTOR_SYSTEM = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird EINE offene Aufgabe (Task) zu einem Fall gezeigt. Erledige sie so weit wie moeglich mit den Tools.
Nutze nur Tools, die wirklich noetig sind — im Zweifel weniger. Konsequente Aktionen (Kommunikation an Kunde,
Statuswechsel) werden einem Menschen zur Bestaetigung vorgelegt, also schlage sie nur bei klarer Notwendigkeit vor.
Wenn die Aufgabe erledigt werden kann, rufe zuletzt task_schliessen mit einem knappen Ergebnis. Wenn du keine
sinnvolle Aktion siehst, rufe KEIN Tool. Begruende jede Aktion knapp und faktenbasiert aus dem Kontext.`

export function buildExecutorSystem(task: TaskRow): string {
  const entry = task.typ ? EXECUTABLE_TYPES[task.typ] : null
  const hint = entry ? `\n\nAufgabentyp „${entry.label}": ${entry.promptHint}` : ''
  return EXECUTOR_SYSTEM + hint
}
