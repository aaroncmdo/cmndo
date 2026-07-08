// Claim-AI-Engine — geteilter Batch-Claude-Call (SP2-Konvergenz P1).
//
// Kapselt die Mechanik, die orchestrator/run.ts (reviewClaim) und aufsicht/
// synthese.ts (laufeSlaAufsicht) heute byte-identisch duplizieren: Anthropic-
// Client konstruieren, messages.create (Tool-Use), Usage loggen (non-critical),
// Fehler fangen. Die layer-spezifische Extraktion bleibt per `extract`-Callback
// (unterschiedliche Draft-Typen + Validatoren je Ebene).
//
// KEIN 'use server' — exportiert Funktion/Typ. Wirft nie (Fehler → []).
// Streaming-Variante (Konsole) = späterer Einstieg mit geteiltem Extrakt-Kern.

import Anthropic from '@anthropic-ai/sdk'
import { logAiUsage } from '@/lib/ai/usage-log'

export type CallForProposalsInput<T> = {
  model: string
  system: string
  tools: Anthropic.Tool[]
  userContent: string
  /** Layer-spezifisch: mappt die Antwort-Blöcke auf validierte Drafts. */
  extract: (content: Anthropic.ContentBlock[]) => T[]
  maxTokens?: number
  logEndpoint: string
  logFallId?: string | null
}

/**
 * Ein Batch-Tool-Use-Call gegen Claude. Konstruktor im try (fehlt der
 * ANTHROPIC_API_KEY, wirft er → sauber []). Usage-Log non-critical. Gibt
 * `extract(res.content)` zurück — oder [] bei jedem Fehler.
 */
export async function callForProposals<T>(input: CallForProposalsInput<T>): Promise<T[]> {
  let res: Anthropic.Message
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    res = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens ?? 1024,
      system: input.system,
      tools: input.tools,
      messages: [{ role: 'user', content: input.userContent }],
    })
  } catch (err) {
    console.error(`[claim-ai/engine] Anthropic-Call fehlgeschlagen (${input.logEndpoint}):`, err)
    return []
  }

  // Usage-Log: non-critical, darf nie den Haupt-Flow blockieren.
  try {
    await logAiUsage({
      endpoint: input.logEndpoint,
      model: input.model,
      fallId: input.logFallId ?? null,
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    })
  } catch {
    // bewusst swallowed — usage-log non-critical
  }

  return input.extract(res.content)
}
