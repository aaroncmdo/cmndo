// src/lib/task-executor/types.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VerbDefinition } from '@/lib/claim-ai/engine/verbs'

export type Risk = 'safe' | 'consequential'

/** Ein vom LLM komponierter Aktions-Vorschlag (nach validate). `verb` traegt den
 *  Namen, damit Risk + Apply nach der Extraktion auffindbar sind. */
export type ActionDraft = {
  verb: string
  args: Record<string, unknown>
  begruendung?: string
}

/** Minimaler Task-Kontext, den der Executor braucht (frisch server-seitig geladen). */
export type TaskRow = {
  id: string
  typ: string | null
  titel: string
  beschreibung: string | null
  status: string
  claim_id: string | null
  fall_id: string | null
  empfaenger_rolle: string | null
}

export type ExecCtx = {
  db: SupabaseClient
  task: TaskRow
  claimId: string
  fallId: string | null
  userId: string
}

export type ActionResult = { ok: boolean; detail?: string; error?: string }

/** Executor-Verb = Engine-Verb + Risiko-Klasse + Apply-Seiteneffekt. */
export type ActionVerb = VerbDefinition<ActionDraft> & {
  risk: Risk
  apply: (draft: ActionDraft, ctx: ExecCtx) => Promise<ActionResult>
}

export type PlanStep = {
  verb: string
  args: Record<string, unknown>
  risk: Risk
  begruendung?: string
  applied?: boolean
  result?: ActionResult
}

export type ExecutionPlan = {
  steps: PlanStep[]
  begruendung: string
  hatConsequential: boolean
}
