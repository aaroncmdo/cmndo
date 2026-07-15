// Werkstatt-Copilot: Streaming-Endpoint (reparatur-/abwicklungs-fokussiert).
// Sonnet 4.6, cached Static-Prompt + dynamischer Auftrags-Kontext. Auth-Gate:
// eingeloggte Werkstatt, die den Auftrag besitzt (getWerkstattAuftrag =
// v_werkstatt_auftrag RLS is_werkstatt_for_claim) -> sonst 403. getWerkstattAuftrag
// liefert zugleich den vollen Kontext (kein separater Admin-Loader noetig).

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getWerkstattByUserId,
  getWerkstattAuftrag,
  getWerkstattAuftragExtra,
} from '@/lib/werkstatt/queries'
import {
  WERKSTATT_COPILOT_SYSTEM_STATIC,
  buildWerkstattCopilotDynamicSystem,
} from '@/lib/werkstatt/copilot-prompt'
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

  let body: { claimId?: string; messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Request-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const claimId = typeof body.claimId === 'string' ? body.claimId : null
  const messages = validateMessages(body.messages)
  if (!claimId || !messages) {
    return new Response(JSON.stringify({ error: 'claimId und gültige messages erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) {
    return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Ownership-Gate + Kontext in einem: v_werkstatt_auftrag ist RLS-gegatet
  // (is_werkstatt_for_claim). null = kein Zugriff auf diesen Auftrag.
  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) {
    return new Response(JSON.stringify({ error: 'Kein Zugriff auf diesen Auftrag' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const extra = await getWerkstattAuftragExtra(claimId)

  const systemDynamic = buildWerkstattCopilotDynamicSystem(auftrag, extra)
  const model = AI_MODELS.werkstatt_copilot

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
              text: WERKSTATT_COPILOT_SYSTEM_STATIC,
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
        void logAiUsage({ endpoint: 'werkstatt_copilot', model, fallId: claimId, usage: final.usage })
        controller.close()
      } catch (err) {
        console.error('[werkstatt-copilot] Stream-Fehler:', err)
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
