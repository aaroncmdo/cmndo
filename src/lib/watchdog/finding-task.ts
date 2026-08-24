/**
 * Meldet Waechter-Findings als Task — damit ein Fund einen EMPFAENGER hat.
 *
 * ANLASS (23.08.2026): Drei Integritaets-Waechter existierten im Code und liefen NIE
 * (kein crontab-Eintrag, kein pg_cron-Job): `money-integrity-check` (USt-Tripel,
 * §14-Belege, Ledger-Drift), `termine-integrity-check` (Doppelbuchungen) und
 * `repair-workstate-check`. Beim manuellen Probelauf meldete der dritte sofort einen
 * echten Fund.
 *
 * ⭐ Sie einfach einzuplanen waere FALSCH gewesen: Alle drei antworten mit **HTTP 200
 * auch dann, wenn sie Findings haben** — `cron-call.sh` haette jede Nacht brav
 * „ok http=200" geloggt, waehrend die Funde nur als JSON-Zeile in einem Logfile
 * standen, das niemand liest. Das ist ein totes Postfach, und ein Alarm ins tote
 * Postfach ist schlechter als kein Alarm: er erzeugt den Anschein von Aufsicht.
 *
 * Der Empfaenger ist deshalb ein Task mit `task_code`-Dedup — dasselbe Muster, das
 * `storage-referenz-check` (#5497) im Echtbetrieb bereits bewiesen hat: zwei Laeufe,
 * ein Task.
 */

import { createLinkedTask } from '@/lib/tasks/create-task'
import type { TaskPrioritaet } from '@/lib/tasks/types'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Wie viele Einzelfunde in die Beschreibung wandern, bevor abgekuerzt wird. */
export const MAX_ZEILEN_IM_TASK = 10

export type FindingTaskEingabe = {
  /** Stabiler Code fuer den Dublettenschutz — ein Code je Waechter, nie je Fund. */
  taskCode: string
  titel: string
  /** Fuehrender Absatz: was der Fund bedeutet, nicht nur dass es ihn gibt. */
  einleitung: string
  /** Eine Zeile je Fund (bereits menschenlesbar formatiert). */
  zeilen: string[]
  /** Default `dringend` — ein Integritaets-Fund ist nie „normal". */
  prioritaet?: TaskPrioritaet
}

export type FindingTaskErgebnis =
  | { angelegt: true }
  | { angelegt: false; grund: 'keine-findings' | 'schon-offen' | 'fehler' }

/**
 * Baut den Beschreibungstext. Pure Funktion — der Kern ist ohne DB testbar.
 */
export function baueBeschreibung(eingabe: Pick<FindingTaskEingabe, 'einleitung' | 'zeilen'>): string {
  const gezeigt = eingabe.zeilen.slice(0, MAX_ZEILEN_IM_TASK)
  const rest = eingabe.zeilen.length - gezeigt.length
  const liste = gezeigt.map((z) => `• ${z}`).join('\n')
  return `${eingabe.einleitung}\n\n${liste}` + (rest > 0 ? `\n… und ${rest} weitere` : '')
}

/**
 * Legt genau dann einen Task an, wenn es Findings gibt UND noch kein offener Task
 * mit demselben `task_code` existiert.
 *
 * ⚠ Wirft nie: ein Waechter, der an seiner eigenen Meldung stirbt, verliert auch den
 * Befund. Fehler werden geloggt und als `{ angelegt: false, grund: 'fehler' }`
 * zurueckgegeben — der Aufrufer kann sie in seine Antwort aufnehmen.
 */
export async function meldeFindingsAlsTask(
  db: SupabaseClient,
  eingabe: FindingTaskEingabe,
): Promise<FindingTaskErgebnis> {
  if (eingabe.zeilen.length === 0) return { angelegt: false, grund: 'keine-findings' }

  try {
    // Dublettenschutz: sonst waechst pro Lauf ein Duplikat und die Aufgabenliste
    // verliert ihre Aussagekraft (dieselbe Falle wie beim Smoke-Residue, das die
    // Dispatch-Liste geflutet hat).
    const { data: offen, error } = await db
      .from('tasks')
      .select('id')
      .eq('task_code', eingabe.taskCode)
      .neq('status', 'erledigt')
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(`[watchdog:${eingabe.taskCode}] Dedup-Abfrage fehlgeschlagen:`, error.message)
      return { angelegt: false, grund: 'fehler' }
    }
    if (offen) return { angelegt: false, grund: 'schon-offen' }

    // Bewusst OHNE entity_type: der Befund haengt an keiner einzelnen Entitaet
    // (TaskEntityType kennt kein 'system'). Adressiert wird die Rolle, damit der Task
    // einen Verantwortlichen bekommt statt in einem Pool zu landen.
    await createLinkedTask({
      task_code: eingabe.taskCode,
      titel: eingabe.titel,
      beschreibung: baueBeschreibung(eingabe),
      prioritaet: eingabe.prioritaet ?? 'dringend',
      empfaenger_rolle: 'admin',
      auto_erstellt: true,
    })
    return { angelegt: true }
  } catch (err) {
    console.error(`[watchdog:${eingabe.taskCode}] Task-Anlage fehlgeschlagen:`, err)
    return { angelegt: false, grund: 'fehler' }
  }
}
