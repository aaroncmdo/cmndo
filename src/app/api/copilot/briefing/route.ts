// AAR-435: Streaming-Endpoint für das Pre-Call Briefing.
// Client (ClickToCall-Dialog) konsumiert via fetch() + getReader().

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamPreCallBriefing } from '@/lib/copilot/briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return new Response(JSON.stringify({ error: 'Nicht angemeldet' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { fallId?: string; leadId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Request-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.fallId && !body.leadId) {
    return new Response(JSON.stringify({ error: 'fallId oder leadId erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of streamPreCallBriefing(body)) {
          if (evt.type === 'token') {
            controller.enqueue(encoder.encode(evt.value))
          } else if (evt.type === 'error') {
            controller.enqueue(encoder.encode(`\n\n[Fehler] ${evt.error}`))
            controller.close()
            return
          }
        }
        controller.close()
      } catch (err) {
        console.error('[AAR-435] Briefing-Stream-Handler:', err)
        controller.enqueue(encoder.encode('\n\n[Fehler] Stream abgebrochen'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Accel-Buffering': 'no',
    },
  })
}
