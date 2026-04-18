// AAR-489 (M7): Streaming-Endpoint für den Makler-Copilot.
// Sonnet 4.6 mit cached Static-Prompt + dynamischem Fall-Kontext.
// Consent-Gate: nur Vollzugriff — minimal/widerrufen -> 403.
// Persistiert die Session nicht (MVP — post-MVP: ki_gespraeche upsert).

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMakler } from '@/lib/makler/queries'
import {
  MAKLER_COPILOT_SYSTEM_STATIC,
  buildCopilotDynamicSystem,
} from '@/lib/makler/copilot-prompt'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ClientMessage = { role: 'user' | 'assistant'; content: string }

function validateMessages(raw: unknown): ClientMessage[] | null {
  if (!Array.isArray(raw)) return null
  const out: ClientMessage[] = []
  for (const m of raw) {
    if (
      !m ||
      typeof m !== 'object' ||
      !('role' in m) ||
      !('content' in m) ||
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string' ||
      m.content.length === 0 ||
      m.content.length > 4000
    ) {
      return null
    }
    out.push({ role: m.role, content: m.content })
  }
  if (out.length === 0 || out.length > 30) return null
  if (out[out.length - 1].role !== 'user') return null
  return out
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: { fallId?: string; messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Request-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fallId = typeof body.fallId === 'string' ? body.fallId : null
  const messages = validateMessages(body.messages)
  if (!fallId || !messages) {
    return new Response(
      JSON.stringify({ error: 'fallId und gültige messages erforderlich' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const makler = await getCurrentMakler()
  if (!makler) {
    return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = await createClient()
  const { data: consent } = await supabase
    .from('makler_fall_consent')
    .select('consent_scope, widerrufen_am')
    .eq('makler_id', makler.id)
    .eq('fall_id', fallId)
    .maybeSingle()

  if (
    !consent ||
    consent.widerrufen_am ||
    consent.consent_scope !== 'vollzugriff'
  ) {
    return new Response(
      JSON.stringify({ error: 'Kein Vollzugriff-Consent für diesen Fall' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const systemDynamic = await buildCopilotDynamicSystem(fallId, makler.firma)
  const model = AI_MODELS.makler_copilot

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropic = new Anthropic({ apiKey })
        const stream = anthropic.messages.stream({
          model,
          max_tokens: 2048,
          system: [
            {
              type: 'text',
              text: MAKLER_COPILOT_SYSTEM_STATIC,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: systemDynamic },
          ],
          messages: messages.slice(-20),
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        const final = await stream.finalMessage()

        void logAiUsage({
          endpoint: 'makler_copilot',
          model,
          fallId,
          usage: final.usage,
        })

        controller.close()
      } catch (err) {
        console.error('[AAR-489] Copilot-Stream-Fehler:', err)
        controller.enqueue(
          encoder.encode(
            '\n\n[Fehler] Copilot-Antwort abgebrochen. Bitte erneut versuchen.',
          ),
        )
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Accel-Buffering': 'no',
    },
  })
}
