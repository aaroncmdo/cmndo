// Pure SLA breach-task auto-resolve helper.
// No DB, no side effects — safe to import from any context (server, edge, test).

/** The task-status enum (public.task_status). 'abgebrochen' is NOT a member — verified. */
export type TaskStatus = 'offen' | 'in-bearbeitung' | 'erledigt' | 'blockiert'

export interface SlaBreachTaskCancel {
  status: TaskStatus            // always 'erledigt' (no 'cancelled'/'abgebrochen' member exists)
  erledigt_am: string           // ISO timestamp — parity with the repo auto-resolve marker (resolve-tasks.ts)
  auto_resolved_am: string      // ISO timestamp
  auto_resolved_grund: string   // human-readable reason
}

const DEFAULT_GRUND = 'SLA erfüllt — automatisch abgeschlossen'

/** Pure: the patch to auto-resolve a task when its SLA completes.
 *  Uses 'erledigt' + auto_resolved_* (the repo auto-resolve marker) — NEVER the invalid 'abgebrochen'. */
export function resolveSlaBreachTaskCancel(now: Date, grund?: string): SlaBreachTaskCancel {
  return {
    status: 'erledigt',
    erledigt_am: now.toISOString(),
    auto_resolved_am: now.toISOString(),
    auto_resolved_grund: grund ?? DEFAULT_GRUND,
  }
}
