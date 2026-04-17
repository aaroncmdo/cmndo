// AAR-445: Fall-Analyse nach FAQ-Bot-Interaktionen.
//
// Nach einer Bot-Session mit ausreichend Turns (>=4) wird im Hintergrund eine
// strukturierte Analyse erstellt und in die bestehende Tabelle
// `fall_summaries` geschrieben. Der KB-Copilot (AAR-446) zieht später die
// letzte Analyse in sein Pre-Call-Briefing.
//
// Throttle: max 1 Insert pro Fall pro 24h. Das reicht für „die heutige
// Bot-Session" und hält die Kosten im Griff.
//
// Fire-and-forget: der Caller (API-Route nach Stream-End) darf NICHT warten.
// Fehler werden geloggt, blockieren die User-Experience aber nie.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import type { ChatMessage } from './ask'

// System-Prompt: striktes JSON — keine Markdown-Fences, keine Prosa.
const ANALYSE_SYSTEM = `Du analysierst ein abgeschlossenes Chat-Gespräch
zwischen einem Kfz-Schadenkunden und einem FAQ-Bot. Deine Analyse hilft
später dem Kundenbetreuer (KB), den Kunden vor einem Anruf einzuschätzen.

Antworte AUSSCHLIESSLICH als reines JSON-Objekt im folgenden Format
(keine Markdown-Fences, keine Erklärung davor oder danach):

{
  "anliegen": "1 Satz: Was will der Kunde wirklich wissen?",
  "zusammenfassung": "2-4 Sätze: Worum ging es, welche Antworten bekam der Kunde, wo blieb er unzufrieden?",
  "naechste_schritte": ["Konkreter Action-Item 1", "Konkreter Action-Item 2"]
}

Regeln:
- Deutsch, SIE-Form im Kontext des KB.
- \`naechste_schritte\` ist ein Array aus 1-3 kurzen Strings (je max 1 Satz).
- Keine Bewertung, keine Kritik am Kunden.
- Wenn der Chat zu dünn ist für eine sinnvolle Analyse: trotzdem JSON, aber
  \`anliegen\` mit „unklar" + \`naechste_schritte\` = ["Kunde zurückrufen und Anliegen klären"].`

type AnalyseResult = {
  anliegen: string
  zusammenfassung: string
  naechste_schritte: string[]
}

/**
 * Prüft ob in den letzten 24h bereits eine Analyse für diesen Fall existiert.
 * Race-Conditions bei parallelen Tabs sind akzeptabel (im Zweifel eine
 * doppelte Analyse — keine Dateninkonsistenz).
 */
async function wurdeHeuteBereitsAnalysiert(fallId: string): Promise<boolean> {
  const admin = createAdminClient()
  const seit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('fall_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('fall_id', fallId)
    .gte('generated_at', seit)
  return (count ?? 0) > 0
}

async function ladeSnapshotMetadaten(
  fallId: string,
): Promise<{
  status: string | null
  dokumente: number
  nachrichten: number
  letztesTimelineEventAt: string | null
}> {
  const admin = createAdminClient()
  const [fallRes, docRes, msgRes, timelineRes] = await Promise.all([
    admin.from('faelle').select('status').eq('id', fallId).maybeSingle(),
    admin
      .from('pflichtdokumente')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fallId),
    admin
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fallId),
    admin
      .from('timeline')
      .select('created_at')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    status: (fallRes.data?.status as string | null) ?? null,
    dokumente: docRes.count ?? 0,
    nachrichten: msgRes.count ?? 0,
    letztesTimelineEventAt: (timelineRes.data?.created_at as string | null) ?? null,
  }
}

function extrahiereJson(raw: string): AnalyseResult | null {
  // Robustes Parsing: erstes {...}-Block extrahieren falls das Modell doch
  // Prosa drumherum zurückgibt.
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Partial<AnalyseResult>
    if (
      typeof parsed.anliegen !== 'string' ||
      typeof parsed.zusammenfassung !== 'string' ||
      !Array.isArray(parsed.naechste_schritte)
    ) {
      return null
    }
    return {
      anliegen: parsed.anliegen,
      zusammenfassung: parsed.zusammenfassung,
      naechste_schritte: parsed.naechste_schritte.filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      ),
    }
  } catch {
    return null
  }
}

/**
 * Triggert die Fall-Analyse wenn die Bot-Session relevant ist. Fire-and-forget:
 * wirft keine Fehler, blockiert nichts, loggt Fehler nur.
 *
 * @param fallId   Fall-UUID
 * @param historie Komplette Chat-Historie (inkl. letzter Bot-Antwort)
 * @param userId   User-ID des Kunden (für `generated_by_user_id`)
 */
export async function maybeAnalyseBotInteraktion(
  fallId: string,
  historie: ChatMessage[],
  userId: string | null,
): Promise<void> {
  try {
    // Minimum-Turns: min 4 Messages (>= 2 User-Fragen + 2 Bot-Antworten),
    // sonst ist der Chat zu dünn für eine sinnvolle Analyse.
    if (!Array.isArray(historie) || historie.length < 4) return

    if (await wurdeHeuteBereitsAnalysiert(fallId)) return

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('[AAR-445] ANTHROPIC_API_KEY fehlt — Analyse übersprungen')
      return
    }

    const snapshot = await ladeSnapshotMetadaten(fallId)

    // Chat-Verlauf als Klartext — das LLM braucht Rollen-Labels + die echte
    // Reihenfolge um das Anliegen ableiten zu können.
    const chatText = historie
      .map((m) => `[${m.role === 'user' ? 'Kunde' : 'Bot'}] ${m.content}`)
      .join('\n\n')

    const model = AI_MODELS.fall_summary
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system: ANALYSE_SYSTEM,
      messages: [{ role: 'user', content: chatText }],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const analyse = extrahiereJson(raw)
    if (!analyse) {
      console.error('[AAR-445] JSON-Parsing fehlgeschlagen — raw:', raw)
      return
    }

    // naechste_schritte als TEXT speichern (DB-Spalte ist TEXT, nicht ARRAY).
    // Format: Bullet-Liste mit „- " damit UI + Briefing-Prompt sie direkt
    // rendern können.
    const naechsteSchritteText = analyse.naechste_schritte
      .map((s) => `- ${s}`)
      .join('\n')

    const admin = createAdminClient()
    const { error } = await admin.from('fall_summaries').insert({
      fall_id: fallId,
      kunden_anliegen: analyse.anliegen,
      zusammenfassung: analyse.zusammenfassung,
      empfohlene_naechste_schritte: naechsteSchritteText,
      ai_modell: model,
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      generated_by_user_id: userId,
      generated_at: new Date().toISOString(),
      fall_status_at_generation: snapshot.status,
      anzahl_dokumente_at_generation: snapshot.dokumente,
      anzahl_nachrichten_at_generation: snapshot.nachrichten,
      letzte_timeline_event_at_generation: snapshot.letztesTimelineEventAt,
    })
    if (error) {
      console.error('[AAR-445] fall_summaries-Insert fehlgeschlagen:', error)
      return
    }

    // Usage-Log analog zum FAQ-Bot.
    void logAiUsage({
      endpoint: 'faq_bot_analyse',
      model,
      fallId,
      usage: response.usage,
    })
  } catch (err) {
    // Bewusst swallowen — Analyse darf NIE die Bot-Antwort stören.
    console.error('[AAR-445] Analyse-Exception:', err)
  }
}
