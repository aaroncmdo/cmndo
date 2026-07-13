// src/lib/task-executor/plan.ts
import type Anthropic from '@anthropic-ai/sdk'
import { validateActionCall, EXECUTOR_VERBS } from './verbs'
import type { ActionDraft, ExecutionPlan, PlanStep, Risk } from './types'

const RISK_BY_VERB: Record<string, Risk> = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v.risk]))

/** Spiegelt extractProposalsFromToolUse: tool_use-Bloecke → validierte ActionDrafts. */
export function extractActions(content: Anthropic.ContentBlock[]): ActionDraft[] {
  const out: ActionDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateActionCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}

/** Klassifiziert Risk, ordnet task_schliessen ans Ende, aggregiert Begruendung. */
export function buildPlan(drafts: ActionDraft[]): ExecutionPlan {
  const steps: PlanStep[] = drafts.map((d) => ({
    verb: d.verb,
    args: d.args,
    risk: RISK_BY_VERB[d.verb] ?? 'consequential', // unbekannt → sicherste Annahme
    begruendung: d.begruendung,
  }))
  const nichtSchliessen = steps.filter((s) => s.verb !== 'task_schliessen')
  const schliessen = steps.filter((s) => s.verb === 'task_schliessen')
  const geordnet = [...nichtSchliessen, ...schliessen]
  const begruendung = geordnet.map((s) => s.begruendung).filter(Boolean).join(' · ') || 'KI-Ausfuehrung'
  return {
    steps: geordnet,
    begruendung,
    hatConsequential: geordnet.some((s) => s.risk === 'consequential'),
  }
}
