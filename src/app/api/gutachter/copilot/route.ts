// SV-Copilot: Streaming-Endpoint (technisch-fachlich). Sonnet 4.6 mit cached
// Static-Prompt + dynamischem Fall-Kontext. Auth-Gate: eingeloggter SV, der
// den Fall besitzt (v_claim_full-RLS via sv_id) -> sonst 403. Spiegelt
// api/makler/copilot/route.ts (dort Consent-Gate, hier sv_id-Ownership).

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import {
  GUTACHTER_COPILOT_SYSTEM_STATIC,
  buildGutachterCopilotDynamicSystem,
} from '@/lib/gutachter/copilot-prompt'
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
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
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
    return new Response(JSON.stringify({ error: 'fallId und gültige messages erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) {
    return new Response(JSON.stringify({ error: 'Kein Sachverständigen-Profil' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Ownership-Gate: v_claim_full ist per claim_sichtbar_fuer_aktuellen_user
  // RLS-gegated (u.a. sv_id-Match). Ein SV-Client-Read, der eine Zeile liefert,
  // beweist die Fall-Zugehoerigkeit — sonst 403. (Der Admin-Client im Prompt-
  // Loader laeuft erst NACH diesem Gate.)
  const { data: owns } = await supabase
    .from('v_claim_full')
    .select('id')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!owns) {
    return new Response(JSON.stringify({ error: 'Kein Zugriff auf diesen Fall' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const systemDynamic = await buildGutachterCopilotDynamicSystem(fallId)
  const model = AI_MODELS.gutachter_copilot

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
              text: GUTACHTER_COPILOT_SYSTEM_STATIC,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: systemDynamic },
          ],
          messages: messages.slice(-20),
        })

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        const final = await stream.finalMessage()
        void logAiUsage({ endpoint: 'gutachter_copilot', model, fallId, usage: final.usage })
        controller.close()
      } catch (err) {
        console.error('[gutachter-copilot] Stream-Fehler:', err)
        controller.enqueue(
          encoder.encode('\n\n[Fehler] Copilot-Antwort abgebrochen. Bitte erneut versuchen.'),
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
