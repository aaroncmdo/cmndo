import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { buildIntakeSystemPrompt } from './prompt'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export type IntakeTurn = { role: 'user' | 'assistant'; content: string }
export type IntakeTurnResult =
  | { ok: true; deltas: Record<string, unknown>; naechste_frage: string; fertig: boolean }
  | { ok: false; error: string }

const TOOL: Anthropic.Tool = {
  name: 'erfasse_felder',
  description:
    'Gib die aus der letzten Kundennachricht extrahierten Feld-Werte, die naechste Frage und ob alle Pflichtangaben vollstaendig sind zurueck.',
  input_schema: {
    type: 'object',
    properties: {
      deltas: {
        type: 'object',
        description:
          'Map feld_key -> Wert; nur bekannte feld_keys, nur was aus der Nachricht klar hervorgeht.',
      },
      naechste_frage: {
        type: 'string',
        description: 'Die naechste an den Kunden gerichtete Frage (oder Abschluss-Satz).',
      },
      fertig: {
        type: 'boolean',
        description: 'true, wenn alle offenen Pflichtangaben erfasst sind.',
      },
    },
    required: ['deltas', 'naechste_frage', 'fertig'],
  },
}

export async function extractIntakeTurn(p: {
  firmenname: string | null
  schema: IntakeFeld[]
  bekannt: Record<string, unknown>
  historie: IntakeTurn[]
  nachricht: string
  /** Heutiges Datum (YYYY-MM-DD) fuer relative Datumsangaben im Prompt. */
  heute?: string
}): Promise<IntakeTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  if (!p.nachricht.trim()) return { ok: false, error: 'Nachricht fehlt' }

  const system = buildIntakeSystemPrompt({
    firmenname: p.firmenname,
    schema: p.schema,
    bekannt: p.bekannt,
    heute: p.heute,
  })
  const messages: IntakeTurn[] = [
    ...p.historie.slice(-12),
    { role: 'user', content: p.nachricht.trim() },
  ]

  try {
    const anthropic = new Anthropic({ apiKey })
    const res = await anthropic.messages.create({
      model: AI_MODELS.flow_intake,
      max_tokens: 700,
      system: [{ type: 'text', text: system }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'erfasse_felder' },
      messages,
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return { ok: false, error: 'Keine strukturierte Antwort' }
    const input = block.input as {
      deltas?: Record<string, unknown>
      naechste_frage?: string
      fertig?: boolean
    }
    return {
      ok: true,
      deltas: input.deltas ?? {},
      naechste_frage: input.naechste_frage ?? '',
      fertig: input.fertig === true,
    }
  } catch (err) {
    console.error('[flow-intake] extract fehlgeschlagen:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Claude-API-Fehler' }
  }
}
