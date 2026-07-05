// AI-Claim-Orchestrator — Anthropic Tool-Use Runner.
// Ruft Claude mit validierten Tool-Definitionen auf und extrahiert Vorschlaege.
// NIE unhandled werfen — alle Fehler werden gefangen und geloggt.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import type { ClaimContext, ProposalDraft } from './types'
import { summarizeClaimForPrompt } from './context'
import { ORCHESTRATOR_TOOLS, validateToolCall } from './tools'
import { persistProposals } from './proposals'

const SYSTEM = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird ein STAGNIERENDER Fall gezeigt. Beurteile, was als Nächstes passieren sollte, um ihn voranzubringen.
Nutze die Tools, um konkrete Vorschläge zu machen — 0 bis 3 pro Fall. Wenn nichts sinnvoll ist, mache keinen Vorschlag.
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = AI_MODELS.claim_orchestrator
  let res: Anthropic.Message
  try {
    res = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      tools: ORCHESTRATOR_TOOLS,
      messages: [{ role: 'user', content: summarizeClaimForPrompt(ctx) }],
    })
  } catch (err) {
    console.error('[orchestrator] Anthropic-Call fehlgeschlagen:', err)
    return 0
  }
  // Usage-Log: non-critical, darf nie den Haupt-Flow blockieren.
  try {
    await logAiUsage({
      endpoint: 'claim_orchestrator',
      model,
      fallId: ctx.fallId ?? null,
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    })
  } catch {
    // bewusst swallowed — usage-log non-critical
  }
  const drafts = extractProposalsFromToolUse(res.content)
  return persistProposals(ctx.claimId, model, drafts)
}
