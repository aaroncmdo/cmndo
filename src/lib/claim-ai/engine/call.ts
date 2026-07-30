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
      // Prompt-Caching: cache_control auf dem System-Block cached den stabilen
      // Prefix tools + system mit (Render-Reihenfolge tools -> system -> messages,
      // Prefix-Match bis zum Breakpoint). Der volatile userContent steht danach,
      // der Prefix ist ueber Calls hinweg byte-identisch -> Cache-Read statt Full-
      // Price ab dem 2. Call. Analog zu streamForProposals, das cache_control-
      // Bloecke schon durchreicht. Der String-Input bleibt die API (Caller
      // uebergeben system: string) — das Wrappen ist eine reine Kosten-Optimierung.
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
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

// ---------------------------------------------------------------------------
// streamForProposals — Streaming-Geschwister (SP2-Konvergenz §8 #1)
// ---------------------------------------------------------------------------

export type StreamForProposalsInput<T> = {
  model: string
  /** string ODER TextBlockParam[] (Konsole nutzt cache_control-Blöcke). */
  system: string | Anthropic.TextBlockParam[]
  tools: Anthropic.Tool[]
  messages: Anthropic.MessageParam[]
  /** Layer-spezifisch: mappt die finalen Antwort-Blöcke auf validierte Drafts. */
  extract: (content: Anthropic.ContentBlock[]) => T[]
  maxTokens?: number
  logEndpoint: string
  logFallId?: string | null
  /** Wird pro Text-Delta gerufen — der Caller streamt zum Client + akkumuliert selbst. */
  onTextDelta: (text: string) => void
}

/**
 * Streaming-Variante von callForProposals: teilt den Extrakt-/Persist-Kern
 * (finalMessage → extract + Usage-Log), streamt Text-Deltas per `onTextDelta`.
 *
 * ANDERS als callForProposals (Batch, wirft nie → []): diese Variante WIRFT bei
 * Stream-Fehlern, damit der Caller den Fehler in seinem eigenen SSE-Stream
 * signalisieren kann (die Konsole enqueued eine Fehler-Nachricht + schließt sauber).
 * logAiUsage bleibt non-critical (swallowed).
 */
export async function streamForProposals<T>(input: StreamForProposalsInput<T>): Promise<T[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const stream = client.messages.stream({
    model: input.model,
    max_tokens: input.maxTokens ?? 1024,
    system: input.system,
    tools: input.tools,
    messages: input.messages,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      input.onTextDelta(event.delta.text)
    }
  }

  const final = await stream.finalMessage()

  // Usage-Log: non-critical, darf nie den Haupt-Flow blockieren.
  try {
    await logAiUsage({
      endpoint: input.logEndpoint,
      model: input.model,
      fallId: input.logFallId ?? null,
      usage: {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
      },
    })
  } catch {
    // bewusst swallowed — usage-log non-critical
  }

  return input.extract(final.content)
}
