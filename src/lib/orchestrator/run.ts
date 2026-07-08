// AI-Claim-Orchestrator — Anthropic Tool-Use Runner.
// Ruft Claude mit validierten Tool-Definitionen auf und extrahiert Vorschlaege.
// NIE unhandled werfen — alle Fehler werden gefangen und geloggt.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { callForProposals } from '@/lib/claim-ai/engine/call'
import type { ClaimContext, ProposalDraft } from './types'
import { GRADUATION } from './types'
import { summarizeClaimForPrompt } from './context'
import { ORCHESTRATOR_TOOLS, validateToolCall } from './tools'
import { persistProposals, persistAutoProposal } from './proposals'
import { getAutoMode, isAutoEligible, isKillSwitchOn } from './policy'
import { buildTaskFromProposal } from './task-from-proposal'

const SYSTEM = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird ein STAGNIERENDER Fall gezeigt. Beurteile, was als Nächstes passieren sollte, um ihn voranzubringen.
Nutze die Tools, um konkrete Vorschläge zu machen — 0 bis 3 pro Fall. Wenn nichts sinnvoll ist, mache keinen Vorschlag.
Dir wird ggf. eine Liste „Bereits vorgeschlagen" gezeigt. Wiederhole KEINEN dieser Vorschläge — weder wörtlich noch inhaltlich gleich. Wurde bereits alles Sinnvolle vorgeschlagen, mache KEINEN neuen Vorschlag.
Eskalationen (flag_escalation) sind selten: nur für HARTE Blocker mit konkreter Sofort-Aktion, kein beschreibender Absatz. Im Zweifel propose_task.
Deine Vorschläge werden NICHT automatisch ausgeführt; ein Mensch entscheidet. Begründe jeden Vorschlag knapp und faktenbasiert aus dem Kontext.`

/**
 * Pure Funktion: extrahiert ProposalDrafts aus tool_use-Blöcken einer Anthropic-Antwort.
 * Überspringt text-Blöcke und tool_use-Blöcke mit ungültiger Eingabe (validateToolCall).
 */
export function extractProposalsFromToolUse(content: Anthropic.ContentBlock[]): ProposalDraft[] {
  const out: ProposalDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateToolCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}

/**
 * Reviewt einen stagnierenden Fall mit Claude (Tool-Use).
 * Persistiert valide Vorschläge in ai_claim_proposals.
 * Gibt die Anzahl neu eingefügter Vorschläge zurück (0 bei Fehler).
 * Wirft nie — alle Fehler werden intern gefangen.
 */
export async function reviewClaim(ctx: ClaimContext): Promise<number> {
  const model = AI_MODELS.claim_orchestrator
  // SP2-Konvergenz P1: geteilte Engine (callForProposals) statt inline Anthropic-
  // Call — byte-identisch (Konstruktor-im-try + non-critical Usage-Log + Fehler→[]).
  const drafts = await callForProposals({
    model,
    system: SYSTEM,
    tools: ORCHESTRATOR_TOOLS,
    userContent: summarizeClaimForPrompt(ctx),
    maxTokens: 1024,
    logEndpoint: 'claim_orchestrator',
    logFallId: ctx.fallId ?? null,
    extract: extractProposalsFromToolUse,
  })
  const killSwitch = isKillSwitchOn()
  let autoCount = 0
  const offeneDrafts: ProposalDraft[] = []
  for (const draft of drafts) {
    const mode = await getAutoMode(draft.vorschlagTyp, draft.zielRolle ?? '')
    const eligible =
      isAutoEligible(draft.vorschlagTyp, mode, killSwitch) &&
      autoCount < GRADUATION.rateCapProLauf
    if (eligible) {
      const { task_id } = await buildTaskFromProposal(
        draft.payload,
        draft.zielRolle,
        ctx.claimId,
        'ai_orchestrator_auto',
      )
      if (task_id) {
        await persistAutoProposal(ctx.claimId, model, draft, task_id)
        autoCount++
        continue
      }
      // Task-Erzeugung fehlgeschlagen -> sicher als offen persistieren (fall-through)
    }
    offeneDrafts.push(draft)
  }
  const offenCount = offeneDrafts.length ? await persistProposals(ctx.claimId, model, offeneDrafts) : 0
  return autoCount + offenCount
}
