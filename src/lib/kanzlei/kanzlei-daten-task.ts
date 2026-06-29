// KB/Admin „immer auffordern": Task-Sync fuer den naechsten fehlenden Kanzlei-Fakt.
//
// Aaron 29.06.: KB UND Admin sollen IMMER aufgefordert werden, die fuer die naechste Phase
// fehlenden Daten einzutragen — nicht nur passiv beim Oeffnen des Falls, sondern aktiv in der
// Worklist + Remindern. Diese Funktion haelt genau EINEN offenen „Kanzlei-Daten"-Task pro Fall,
// passend zum aktuell fehlenden Fakt (naechsterKanzleiSchritt). Beim Phasen-Fortschritt wird der
// alte Schritt-Task auto-geschlossen, der neue angelegt. Gehookt in checkFallAutoPhase (laeuft
// nach jedem Phasen-relevanten Ereignis). createAutoTask dedupt by task_code (kein Duplikat).

import { createAdminClient } from '@/lib/supabase/admin'
import { createAutoTask } from '@/lib/tasking'
import { cancelRemindersForTask } from '@/lib/tasks/reminder-generator'
import { naechsterKanzleiSchritt } from './naechster-schritt'
import type { KanzleiFaktKey } from './fakt-mapping'

type StepTask = { code: string; titel: string; prioritaet: 'normal' | 'dringend' | 'kritisch' }

const STEP_TASK: Record<KanzleiFaktKey, StepTask> = {
  anschlussschreiben: { code: 'KZ-AS', titel: 'Kanzlei: Anschlussschreiben-Datum eintragen', prioritaet: 'dringend' },
  vs_reaktion: { code: 'KZ-VS', titel: 'Kanzlei: VS-Reaktion eintragen', prioritaet: 'dringend' },
  regulierung: { code: 'KZ-REG', titel: 'Kanzlei: Regulierung eintragen', prioritaet: 'normal' },
  klage: { code: 'KZ-KLAGE', titel: 'Kanzlei: Klage eintragen', prioritaet: 'normal' },
  zahlung: { code: 'KZ-ZAHL', titel: 'Kanzlei: Zahlungseingang eintragen', prioritaet: 'normal' },
  abschluss: { code: 'KZ-ABSCHLUSS', titel: 'Kanzlei: Fall abschließen', prioritaet: 'normal' },
}
const ALL_CODES = Object.values(STEP_TASK).map((s) => s.code)

/**
 * Haelt genau einen offenen Kanzlei-Daten-Task pro Fall (= der aktuell fehlende Fakt).
 * Schliesst stale Schritt-Tasks (Phase fortgeschritten) + legt den aktuellen an (dedup).
 * Non-critical: Fehler werden vom Caller geschluckt.
 */
export async function syncKanzleiDatenTask(
  fallId: string,
  status: string | null,
  kbId: string | null,
): Promise<void> {
  const next = naechsterKanzleiSchritt(status)
  // 'qc' = Filmcheck/QC hat einen eigenen Task (triggerQcTask) — hier kein KZ-Task.
  const aktiv = next && next.faktKey !== 'qc' ? STEP_TASK[next.faktKey as KanzleiFaktKey] : null
  const aktivCode = aktiv?.code ?? null

  const db = createAdminClient()
  const now = new Date().toISOString()

  // 1. Stale KZ-* Tasks schliessen (alle ausser dem aktuell aktiven Schritt).
  const { data: offene } = await db
    .from('tasks')
    .select('id, task_code')
    .eq('fall_id', fallId)
    .in('task_code', ALL_CODES)
    .in('status', ['offen', 'in-bearbeitung'])
  for (const t of offene ?? []) {
    if (t.task_code === aktivCode) continue
    await db
      .from('tasks')
      .update({
        status: 'erledigt',
        erledigt_am: now,
        auto_resolved_am: now,
        auto_resolved_grund: 'Kanzlei-Phase fortgeschritten',
      })
      .eq('id', t.id)
    try {
      await cancelRemindersForTask(t.id as string)
    } catch {
      /* non-critical */
    }
  }

  // 2. Aktuellen Schritt-Task sicherstellen (createAutoTask dedupt by task_code).
  if (aktiv && next) {
    await createAutoTask({
      fall_id: fallId,
      empfaenger_id: kbId,
      empfaenger_rolle: 'kundenbetreuer',
      task_typ: 'kanzlei-daten',
      titel: aktiv.titel,
      beschreibung: next.hinweis,
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      prioritaet: aktiv.prioritaet,
      phase: 'kanzlei',
      task_code: aktiv.code,
    })
  }
}
