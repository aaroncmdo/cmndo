// src/lib/task-executor/run.ts
import { callForProposals } from '@/lib/claim-ai/engine/call'
import { buildClaimContext, summarizeClaimForPrompt } from '@/lib/orchestrator/context'
import { toolsFrom } from '@/lib/claim-ai/engine/verbs'
import { AI_MODELS } from '@/lib/ai/models'
import { EXECUTOR_VERBS } from './verbs'
import { extractActions, buildPlan } from './plan'
import { buildExecutorSystem } from './registry'
import type { TaskRow, ExecutionPlan } from './types'

/**
 * Plant die KI-Ausfuehrung einer Aufgabe: baut Claim-Kontext + ruft Claude
 * (Single-Turn, volles Executor-Belt) + extrahiert Aktionen. Wirft nie
 * (callForProposals faengt Fehler → []); leerer Plan ist ein gueltiges Ergebnis.
 */
export async function planTaskExecution(task: TaskRow): Promise<ExecutionPlan> {
  const claimId = task.claim_id
  const ctx = claimId ? await buildClaimContext(claimId) : null
  const kontext = ctx ? summarizeClaimForPrompt(ctx) : 'Kein Claim-Kontext verfuegbar.'
  const userContent = `${kontext}\n\nOFFENE AUFGABE:\nTitel: ${task.titel}\nBeschreibung: ${task.beschreibung ?? '(keine)'}\nTyp: ${task.typ ?? '(unbekannt)'}`

  const drafts = await callForProposals({
    model: AI_MODELS.task_executor,
    system: buildExecutorSystem(task),
    tools: toolsFrom(EXECUTOR_VERBS),
    userContent,
    maxTokens: 1024,
    logEndpoint: 'task_executor',
    logFallId: task.fall_id ?? null,
    extract: extractActions,
  })

  return buildPlan(drafts)
}
