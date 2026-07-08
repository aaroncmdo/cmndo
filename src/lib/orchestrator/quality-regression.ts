/**
 * AI-Claim-Orchestrator — Phase 2: Qualitaets-Regressions-Monitor.
 *
 * Zwei Teile:
 *   1. classifyAutoQuality  — pure Funktion, TDD-getestet
 *   2. checkAndRevertAutoQuality — Integration: laedt Daten, triggert Auto-Revert
 *
 * Wirft nie. Alle Fehler werden geloggt + absorbiert.
 *
 * Schlechte Auto-Task-Endzustaende (verifiziert gegen tasks-Schema + Code):
 *   - Task-Row nicht gefunden (hard-deleted via admin/tasks/actions.ts:deleteTask —
 *     deleteTask fuehrt ein echtes .delete() aus, es gibt kein Soft-Delete auf tasks)
 *   - status === 'blockiert'  (stuck, kann nicht weiterverarbeitet werden)
 *
 * Keine "schlechten" Endzustaende:
 *   - 'erledigt'         → Task legitim abgeschlossen
 *   - 'offen'            → Task noch aktiv (kein Signal)
 *   - 'in-bearbeitung'   → Task noch aktiv (kein Signal)
 *
 * DB-Enum task_status (verifiziert in database.types.ts:21057):
 *   "offen" | "in-bearbeitung" | "erledigt" | "blockiert"
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { GRADUATION } from './types'

// Mindest-Sample: kein Auto-Revert auf weniger als N Tasks (verhindert Fehlalarme
// durch einzelne Ausreisser kurz nach der Graduierung).
const MINDEST_SAMPLE = 5

// ── classifyAutoQuality (pure) ────────────────────────────────────────────────

export type AutoQualityStats = {
  autoTasksImFenster: number
  schlechte: number
}

export type AutoQualityResult = {
  badRate: number
  revert: boolean
}

/**
 * Bewertet die Qualitaet von Auto-Tasks fuer eine (typ, rolle)-Kombination.
 *
 * badRate = schlechte / autoTasksImFenster  (0 wenn kein Sample)
 * revert  = autoTasksImFenster >= MINDEST_SAMPLE (5)
 *           && badRate > GRADUATION.revertBadRate (0.30)
 *
 * Pure — kein I/O, kein throw.
 */
export function classifyAutoQuality(stats: AutoQualityStats): AutoQualityResult {
  const { autoTasksImFenster, schlechte } = stats

  const badRate = autoTasksImFenster > 0 ? schlechte / autoTasksImFenster : 0
  const revert =
    autoTasksImFenster >= MINDEST_SAMPLE && badRate > GRADUATION.revertBadRate

  return { badRate, revert }
}

// ── checkAndRevertAutoQuality (Integration) ───────────────────────────────────

export type RevertedEntry = {
  typ: string
  rolle: string
  badRate: number
}

/**
 * Prueft fuer jede (vorschlag_typ, ziel_rolle)-Kombination ob die Auto-Task-
 * Qualitaet unter den Schwellenwert gefallen ist.
 *
 * Ablauf:
 *   1. Lade alle auto-ausgefuehrten Vorschlaege (auto_ausgefuehrt=true)
 *   2. Gruppiere je (vorschlag_typ, ziel_rolle), nimm die letzten GRADUATION.revertFenster (20)
 *   3. Lade deren erzeugte_task_id-Tasks, pruefe ob schlecht (not found oder blockiert)
 *   4. classifyAutoQuality → wenn revert: Policy auf manual setzen + Alert loggen
 *
 * Wirft nie. Fehler werden mit console.error geloggt.
 */
export async function checkAndRevertAutoQuality(): Promise<{
  reverted: RevertedEntry[]
}> {
  const reverted: RevertedEntry[] = []

  try {
    const supabase = createAdminClient()

    // Schritt 1: Alle auto-ausgefuehrten Orchestrator-Vorschlaege laden.
    // Der Spine ai_claim_proposals ist geteilt (quelle orchestrator|copilot|aufsicht);
    // orchestrator_auto_policy governt aber NUR die Orchestrator-Auto-Ausfuehrung, daher
    // quelle-scoped. (Heute setzt nur der Orchestrator auto_ausgefuehrt=true — der Filter
    // haelt die Invariante fuer die kommende quelle-uebergreifende Auto-Ausfuehrung.)
    const { data: proposals, error: propErr } = await supabase
      .from('ai_claim_proposals')
      .select('vorschlag_typ, ziel_rolle, erzeugte_task_id, erstellt_am')
      .eq('auto_ausgefuehrt', true)
      .eq('quelle', 'orchestrator')

    if (propErr) {
      console.error('[quality-regression] Fehler beim Laden der Vorschlaege:', propErr.message)
      return { reverted }
    }
    if (!proposals || proposals.length === 0) return { reverted }

    // Schritt 2: Gruppieren je (typ, rolle), letzte GRADUATION.revertFenster nehmen
    const groups = new Map<string, typeof proposals>()
    for (const p of proposals) {
      const key = `${p.vorschlag_typ}|${p.ziel_rolle ?? ''}`
      const existing = groups.get(key)
      if (existing) {
        existing.push(p)
      } else {
        groups.set(key, [p])
      }
    }

    for (const [key, rows] of groups) {
      // Sortieren: neueste zuerst
      const sorted = [...rows].sort((a, b) =>
        String(b.erstellt_am ?? '').localeCompare(String(a.erstellt_am ?? '')),
      )
      const fenster = sorted.slice(0, GRADUATION.revertFenster)

      // Task-IDs aus dem Fenster extrahieren (nur nicht-null)
      const taskIds = fenster
        .map((r) => r.erzeugte_task_id)
        .filter((id): id is string => id !== null && id !== undefined)

      if (taskIds.length === 0) continue

      // Schritt 3: Tasks laden — Status pruefen
      const { data: tasks, error: taskErr } = await supabase
        .from('tasks')
        .select('id, status')
        .in('id', taskIds)

      if (taskErr) {
        console.error('[quality-regression] Fehler beim Laden der Tasks:', taskErr.message)
        continue
      }

      // Gefundene Task-IDs als Set fuer O(1)-Lookup
      const foundIds = new Set((tasks ?? []).map((t) => t.id))

      // Schlechte Tasks zaehlen:
      //   - ID aus Fenster nicht gefunden → hard-deleted
      //   - status === 'blockiert' → stuck
      let schlechte = 0
      for (const taskId of taskIds) {
        if (!foundIds.has(taskId)) {
          // Hard-deleted
          schlechte++
        }
      }
      for (const task of tasks ?? []) {
        if (task.status === 'blockiert') {
          schlechte++
        }
      }

      const result = classifyAutoQuality({
        autoTasksImFenster: fenster.length,
        schlechte,
      })

      if (!result.revert) continue

      // Schritt 4: Auto-Revert → Policy auf manual setzen
      const [typ, rolle] = key.split('|')
      const badRatePct = (result.badRate * 100).toFixed(0)
      const grund = `Auto-Revert: bad_rate ${badRatePct}% ueber ${fenster.length} Auto-Tasks`

      // Direkt per DB-Upsert (geflippt_von nullable, kein auth-User verfuegbar im Cron)
      const { error: upsertErr } = await supabase
        .from('orchestrator_auto_policy')
        .upsert(
          {
            vorschlag_typ: typ,
            ziel_rolle: rolle || null,
            mode: 'manual' as const,
            geflippt_von: null,
            geflippt_am: new Date().toISOString(),
            auto_revert_grund: grund,
          },
          { onConflict: 'vorschlag_typ,ziel_rolle' },
        )

      if (upsertErr) {
        console.error(
          `[quality-regression] Fehler beim Auto-Revert fuer ${key}:`,
          upsertErr.message,
        )
        continue
      }

      console.error(
        `[quality-regression] AUTO-REVERT: (${typ}, ${rolle}) → manual. ${grund}`,
      )

      reverted.push({ typ, rolle, badRate: result.badRate })
    }
  } catch (err) {
    console.error(
      '[quality-regression] Unerwarteter Fehler in checkAndRevertAutoQuality:',
      err instanceof Error ? err.message : err,
    )
  }

  return { reverted }
}
