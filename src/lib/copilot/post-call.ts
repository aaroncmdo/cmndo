import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { POST_CALL_STATIC_SYSTEM, buildPostCallUser } from './prompts'
import { logAiUsage } from '@/lib/ai/usage-log'
import { AI_MODELS } from '@/lib/ai/models'

// AAR-437: Modell-Audit Nacht-Shift — ehemals hardcoded 'claude-sonnet-4-20250514'
const POST_CALL_MODEL = AI_MODELS.post_call_summary

/**
 * KFZ-143: Post-Call AI Analyse. Wird nach call.ended automatisch getriggert.
 * AAR-436: Statischer System-Prompt gecached, dynamisches Transkript als User-Message.
 */
export async function analyzeCallPostHoc(callId: string): Promise<void> {
  const db = createAdminClient()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { console.log('[KFZ-143] ANTHROPIC_API_KEY nicht gesetzt, überspringe Post-Call Analyse'); return }

  const { data: call } = await db.from('calls')
    .select('id, fall_id, lead_id, transkript_text, dauer_sekunden')
    .eq('id', callId)
    .single()

  if (!call) return

  // Kunden-Daten laden
  let kundeName = '—'
  let fallNummer = '—'
  if (call.fall_id) {
    const { data: fall } = await db.from('faelle').select('claims:claim_id(claim_nummer), lead_id').eq('id', call.fall_id).single()
    fallNummer = (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? '—'
    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
      if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
    }
  }

  const userPrompt = buildPostCallUser({
    fallNummer,
    transkript: call.transkript_text,
    dauer: call.dauer_sekunden ?? 0,
    kundeName,
  })

  const anthropic = new Anthropic({ apiKey })
  // AAR-435: SDK-Pattern auf stream() umgestellt — intern identisches
  // Verhalten für den Aircall-Webhook (Batch-Consumer), aber für spätere
  // Live-Konsumenten ist die gleiche Lib streaming-ready.
  const streamHandle = anthropic.messages.stream({
    model: POST_CALL_MODEL,
    max_tokens: 500,
    // AAR-436: statischer System-Prompt wird gecached
    system: [
      {
        type: 'text',
        text: POST_CALL_STATIC_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })
  const response = await streamHandle.finalMessage()

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  // Versuche JSON zu parsen
  let zusammenfassung = text
  let naechsteSchritte = ''
  let sentiment: string | null = null
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      zusammenfassung = parsed.zusammenfassung ?? text
      naechsteSchritte = parsed.naechste_schritte ?? ''
      sentiment = parsed.stimmung ?? null
    }
  } catch { /* JSON Parse fehlgeschlagen, verwende raw text */ }

  await db.from('calls').update({
    ki_zusammenfassung: zusammenfassung,
    ki_naechste_schritte: naechsteSchritte,
    sentiment,
    updated_at: new Date().toISOString(),
  }).eq('id', callId)

  void logAiUsage({
    endpoint: 'post_call_summary',
    model: POST_CALL_MODEL,
    fallId: call.fall_id ?? null,
    usage: response.usage,
  })

  console.log(`[KFZ-143] Post-Call Analyse für ${callId} abgeschlossen`)
}
