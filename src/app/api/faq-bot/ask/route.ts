// AAR-435: Streaming-Endpoint für den Kunde-FAQ-Bot.
//
// Server-Actions können keinen ReadableStream zurückgeben — deshalb eine
// dedizierte API-Route. Der Client (FaqBotCard) nutzt fetch() + getReader()
// und rendert Tokens live. Die Fallback-Server-Action askKundenFaq bleibt
// bestehen (siehe faq-bot-actions.ts), falls JS deaktiviert ist.
//
// Scope: nur rolle='kunde'. KB hat aktuell keinen Client-Einstieg (siehe
// Ticket-Commentar), deshalb hier nicht exponiert.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { streamFaqBot, type ChatMessage } from '@/lib/faq-bot/ask'
import { maybeAnalyseBotInteraktion } from '@/lib/faq-bot/analyse'

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

  let body: { fallId?: string; frage?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Request-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fallId = body.fallId
  const frage = body.frage?.trim() ?? ''

  if (!fallId || !frage) {
    return new Response(JSON.stringify({ error: 'fallId und frage erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Ownership-Check: Kunde muss den Fall besitzen.
  const { data: fall } = await supabase
    .from('faelle')
    .select('kunde_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall || fall.kunde_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Fall nicht zugewiesen' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Bestehende Historie laden (für Claude-Context) — via admin weil
  // ki_gespraeche strengere RLS hat.
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('ki_gespraeche')
    .select('id, nachrichten')
    .eq('fall_id', fallId)
    .eq('rolle', 'kunde')
    .eq('user_id', user.id)
    .maybeSingle()

  const history: ChatMessage[] = Array.isArray(existing?.nachrichten)
    ? (existing.nachrichten as ChatMessage[])
    : []

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullAntwort = ''
      try {
        for await (const evt of streamFaqBot(fallId, frage, 'kunde', history)) {
          if (evt.type === 'token') {
            fullAntwort += evt.value
            controller.enqueue(encoder.encode(evt.value))
          } else if (evt.type === 'error') {
            // Fehler als finale Chunk — Client erkennt abrupten Abbruch
            controller.enqueue(encoder.encode(`\n\n[Fehler] ${evt.error}`))
            controller.close()
            return
          } else if (evt.type === 'done') {
            // finale Antwort für Persistenz nutzen (Off-Topic-Fallbacks
            // enthalten dieselbe Antwort nochmal).
            fullAntwort = evt.antwort
          }
        }

        // Historie persistieren — identisches Pattern wie Server-Action.
        const now = new Date().toISOString()
        const nextHistory: ChatMessage[] = [
          ...history,
          { role: 'user', content: frage, ts: now },
          { role: 'assistant', content: fullAntwort, ts: new Date().toISOString() },
        ]
        await admin
          .from('ki_gespraeche')
          .upsert(
            {
              fall_id: fallId,
              rolle: 'kunde',
              user_id: user.id,
              nachrichten: nextHistory,
              updated_at: now,
            },
            { onConflict: 'fall_id,rolle,user_id' },
          )

        // AAR-445: Fall-Analyse im Hintergrund triggern. Fire-and-forget —
        // blockiert den Stream-Close nicht, Fehler werden in der Analyse
        // selbst geswallowt und geloggt.
        void maybeAnalyseBotInteraktion(fallId, nextHistory, user.id)

        controller.close()
      } catch (err) {
        console.error('[AAR-435] Stream-Handler-Fehler:', err)
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
