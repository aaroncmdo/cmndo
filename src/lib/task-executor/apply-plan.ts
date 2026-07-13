// src/lib/task-executor/apply-plan.ts
import { EXECUTOR_VERBS } from './verbs'
import type { ExecutionPlan, ExecCtx, PlanStep } from './types'

const VERB_BY_NAME = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v]))

export async function applyPlan(
  plan: ExecutionPlan,
  ctx: ExecCtx,
): Promise<{ status: 'ausgefuehrt' | 'fehler'; steps: PlanStep[]; fehler?: string }> {
  const steps: PlanStep[] = plan.steps.map((s) => ({ ...s }))
  for (const step of steps) {
    const verb = VERB_BY_NAME[step.verb]
    if (!verb) {
      step.applied = false
      step.result = { ok: false, error: `Unbekanntes Verb: ${step.verb}` }
      return { status: 'fehler', steps, fehler: step.result.error }
    }
    const result = await verb.apply({ verb: step.verb, args: step.args, begruendung: step.begruendung }, ctx)
    step.applied = true
    step.result = result
    if (!result.ok) {
      return { status: 'fehler', steps, fehler: result.error ?? 'Aktion fehlgeschlagen' }
    }
  }
  return { status: 'ausgefuehrt', steps }
}
