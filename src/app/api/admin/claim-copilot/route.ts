// Claim-AI-Konsole — Admin-Copilot-Streaming-Endpoint.
// Kombiniert: Streaming (Muster aus makler/copilot/route.ts) mit Tool-Use
// (Muster aus src/lib/orchestrator/run.ts). Text-Deltas streamen zum Client;
// nach finalMessage() → Proposals + Thread persistieren (non-critical).
// Guard: nur Admin-Rolle. Body: { fallId, messages, modus? }.

import type Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { streamForProposals } from '@/lib/claim-ai/engine/call'
import { CLAIM_AI_TOOLS, extractClaimAiDrafts } from '@/lib/claim-ai/verbs'
import { persistCopilotProposals } from '@/lib/claim-ai/proposals'
import { appendTurns } from '@/lib/claim-ai/threads'
import { buildClaimAiContext, summarizeClaimAiContext } from '@/lib/claim-ai/context'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { requireAdminUserId } from '@/lib/auth/require-admin-user-id'

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

const SYSTEM_BASE = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Du hast Vollzugriff auf alle Fall-Daten. Beantworte Fragen des Admins praezise und faktenbasiert.
Wenn du konkrete Aktionen vorschlägst, nutze die bereitgestellten Tools — jeder Vorschlag wird NICHT automatisch ausgeführt; der Admin entscheidet. Begründe jeden Vorschlag knapp.`

const DIAGNOSE_PRESET = `Du bist jetzt im Diagnose-Modus. Scanne den Fall systematisch auf:
1. Fehlende Dokumente (Pflichtdokumente mit Status 'offen' oder 'ausstehend')
2. SLA-Risiken (Inaktivitaet > 3 Tage, offene Tasks > 5 Tage alt)
3. Widersprüche (z.B. Hergang vs. Dokumentenlage, widersprüchliche Nachrichten)
4. Stall-Punkte (keine Fortschritte trotz offener Aufgaben)
5. Kommunikations-Lücken (lange Funkstille mit Kunde/SV/Gegner)
6. Compliance-Hinweise (DSGVO-relevante Lücken, fehlende Vollmacht etc.)

Fasse deine Befunde in konkreten Vorschlägen via propose_task / propose_draft_message / propose_add_note zusammen.
Mache 1-4 Vorschläge. Wenn nichts auffällig ist, sag das klar ohne Tool-Aufruf.`

export async function POST(req: Request) {
  // Admin guard runs first — no auth leaks config errors
  const userId = await requireAdminUserId()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Nicht berechtigt' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: { fallId?: string; messages?: unknown; modus?: string }
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
  const modus = body.modus === 'diagnose' ? 'diagnose' : 'chat'

  if (!fallId || !messages) {
    return new Response(
      JSON.stringify({ error: 'fallId und gültige messages erforderlich' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Resolve claim id (fallId can be either faelle.id or claims.id)
  const admin = createAdminClient()
  const claimId = await resolveClaimId(admin, fallId)
  if (!claimId) {
    return new Response(JSON.stringify({ error: 'Fall nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build system prompt + context.
  // Static SYSTEM_BASE als gecachter Block (cache_control ephemeral), Diagnose-Preset
  // als zweiter, per-Request-Block ohne Caching (spiegelt makler/copilot/route.ts).
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_BASE,
      cache_control: { type: 'ephemeral' },
    },
    ...(modus === 'diagnose'
      ? [{ type: 'text' as const, text: DIAGNOSE_PRESET }]
      : []),
  ]

  // Build context summary as first user message (inject before client messages)
  const ctx = await buildClaimAiContext(fallId)
  const contextSummary = ctx ? summarizeClaimAiContext(ctx) : '(Kein Fall-Kontext verfügbar)'

  // Inject context as a synthetic first exchange, then append client messages.
  // Strategy: always inject fresh for stateless endpoint (thread history lives in DB, not here).
  // WICHTIG: Das Kontext-Paar darf NIE aus dem Fenster fallen — wir slicen NUR die
  // Client-Nachrichten (letzte 20) und prependen das Kontext-Paar unbedingt. Sonst
  // verliert Claude bei >20 Client-Nachrichten den kompletten Fall-Kontext.
  const anthropicMessages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `## Fall-Kontext\n\n${contextSummary}` },
    { role: 'assistant', content: 'Danke. Ich habe den Fall-Kontext geladen und stehe bereit.' },
    ...messages.slice(-20),
  ]

  const model = AI_MODELS.claim_copilot
  const encoder = new TextEncoder()
  const lastUserContent = messages[messages.length - 1].content

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // SP2-Konvergenz P3: geteilte Engine (streamForProposals) statt inline-Anthropic-
        // Streaming. onTextDelta streamt zum Client + akkumuliert assistantText; die Engine
        // kapselt Client + stream + finalMessage + Usage-Log + extract. Wirft bei Stream-
        // Fehler -> der äußere catch signalisiert dem Client den Abbruch (SSE-UX erhalten).
        let assistantText = ''
        const drafts = await streamForProposals({
          model,
          system,
          tools: CLAIM_AI_TOOLS,
          messages: anthropicMessages, // Fenster bereits auf Client-Ebene begrenzt; Kontext-Paar bleibt erhalten
          maxTokens: 2048,
          logEndpoint: 'claim_copilot',
          logFallId: fallId,
          extract: extractClaimAiDrafts,
          onTextDelta: (t) => {
            assistantText += t
            controller.enqueue(encoder.encode(t))
          },
        })

        // Non-critical persistence — never break the stream
        try {
          if (drafts.length > 0) {
            await persistCopilotProposals(claimId, model, drafts)
          }
        } catch (err) {
          console.error('[claim-copilot] persistCopilotProposals fehlgeschlagen:', err)
        }

        try {
          const ts = new Date().toISOString()
          // Wenn Claude nur tool_use-Bloecke lieferte (kein Freitext), bleibt assistantText
          // leer — dann Fallback-String persistieren, damit der Thread kohaerent bleibt.
          const assistantContent =
            assistantText.length > 0
              ? assistantText
              : '(Vorschlag erstellt — kein Freitext)'
          await appendTurns(claimId, 'admin', userId, [
            { role: 'user', content: lastUserContent, ts },
            { role: 'assistant', content: assistantContent, ts },
          ])
        } catch (err) {
          console.error('[claim-copilot] appendTurns fehlgeschlagen:', err)
        }

        controller.close()
      } catch (err) {
        console.error('[claim-copilot] Stream-Fehler:', err)
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
