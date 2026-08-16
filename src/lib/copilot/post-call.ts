import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { POST_CALL_STATIC_SYSTEM, buildPostCallUser } from './prompts'
import { logAiUsage } from '@/lib/ai/usage-log'
import { AI_MODELS } from '@/lib/ai/models'
import { extractAnthropicText } from '@/lib/ai/extract-text'

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

  // CMM-49: calls ist claim-gekeyt — claim_id statt fall_id lesen.
  const { data: call } = await db.from('calls')
    .select('id, claim_id, lead_id, transkript_text, dauer_sekunden')
    .eq('id', callId)
    .single()

  if (!call) return

  // Kunden-Daten laden
  let kundeName = '—'
  let fallNummer = '—'
  // CMM-49 (faelle-Drop-Runway): claim_id->fall via Bridge (fall_id==faelle.id); claim_nummer
  // + lead_id aus claims (SSoT, div=0). fallId nur noch fuer logAiUsage gebraucht.
  let fallIdForLog: string | null = null
  if (call.claim_id) {
    const { data: fallRaw } = await db.from('faelle_claim_bridge').select('fall_id, claims:claims!fk_bridge_claim(claim_nummer, lead_id)').eq('claim_id', call.claim_id).maybeSingle()
    const fall = fallRaw as unknown as { fall_id: string; claims?: { claim_nummer: string | null; lead_id: string | null } | { claim_nummer: string | null; lead_id: string | null }[] | null } | null
    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    fallIdForLog = fall?.fall_id ?? null
    fallNummer = fallClaim?.claim_nummer ?? '—'
    if (fallClaim?.lead_id) {
      const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fallClaim.lead_id).single()
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

  const text = extractAnthropicText(response.content)

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
    fallId: fallIdForLog,
    usage: response.usage,
  })

  console.log(`[KFZ-143] Post-Call Analyse für ${callId} abgeschlossen`)
}
