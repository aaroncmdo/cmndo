// AAR-385: Generator für das strukturierte SV-Briefing.
//
// Lädt Fall + Lead per Admin-Client, baut den BriefingInput wieder auf
// (gemeinsam mit AAR-377), ruft Claude Sonnet 4.6 mit JSON-Format und
// validiert per Zod. Fehler → rule-based Fallback (briefing-fallback.ts).
//
// Schreibt in `faelle.sv_briefing_struktur` — ein jsonb Feld, das in
// AAR-380 (Foundation) angelegt wurde. Unabhängig von AAR-377's
// `sv_briefing_text`, damit beide Varianten parallel existieren können.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import { buildBriefingInput } from '@/lib/ai/briefing-prompt'
import {
  buildSvBriefingStrukturSystem,
  buildSvBriefingStrukturUser,
  svBriefingStrukturSchema,
} from '@/lib/ai/briefing-structured-prompt'
import { buildFallbackBriefing } from '@/lib/ai/briefing-fallback'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

const BRIEFING_MODEL = AI_MODELS.sv_briefing_struktur
const MAX_OUTPUT_TOKENS = 700

export type GenerateSvBriefingStrukturResult = {
  success: boolean
  briefing?: SvBriefingStruktur
  generated_by?: 'ai' | 'fallback'
  error?: string
}

/**
 * Extrahiert das erste JSON-Objekt aus einem Claude-Response-Text. Claude
 * liefert trotz System-Prompt gelegentlich ```json-Fences oder Einleitungs-
 * Text — diese entfernen wir tolerant.
 */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  // Fence entfernen: ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch?.[1] ?? trimmed
  // Ersten { bis letzten } nehmen
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Kein JSON-Objekt in Claude-Response')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

export async function generateSvBriefingStruktur(
  fallId: string,
): Promise<GenerateSvBriefingStrukturResult> {
  const admin = createAdminClient()

  const { data: fall, error: fallErr } = await admin
    .from('v_faelle_mit_aktuellem_termin')
    .select('*')
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) {
    return {
      success: false,
      error: `Fall nicht gefunden: ${fallErr?.message ?? 'unbekannt'}`,
    }
  }

  const fallRow = fall as Record<string, unknown>

  // Lead nachladen (für Fallback-Felder wie Sprache, Zeuge)
  let lead: Record<string, unknown> | null = null
  const leadId = fallRow.lead_id as string | null
  if (leadId) {
    const { data: leadRow } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle()
    lead = (leadRow as Record<string, unknown> | null) ?? null
  }

  const input = buildBriefingInput(fallRow, lead)

  const apiKey = process.env.ANTHROPIC_API_KEY
  let briefing: SvBriefingStruktur
  let generatedBy: 'ai' | 'fallback' = 'fallback'
  let usageForLog: Anthropic.Usage | null = null

  if (!apiKey) {
    briefing = buildFallbackBriefing(input)
  } else {
    const anthropic = new Anthropic({
      apiKey,
      timeout: 30_000,
      maxRetries: 2,
    })
    try {
      const response = await anthropic.messages.create({
        model: BRIEFING_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          {
            type: 'text',
            text: buildSvBriefingStrukturSystem(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: buildSvBriefingStrukturUser(JSON.stringify(input, null, 2)),
          },
        ],
      })

      const firstBlock = response.content[0]
      const raw =
        firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''
      usageForLog = response.usage
      const parsed = svBriefingStrukturSchema.parse(extractJsonObject(raw))
      briefing = parsed
      generatedBy = 'ai'
    } catch (err) {
      console.error(
        '[AAR-385] Struktur-Briefing fehlgeschlagen, Fallback greift:',
        err,
      )
      briefing = buildFallbackBriefing(input)
      generatedBy = 'fallback'
    }
  }

  const generatedAtIso = new Date().toISOString()
  const { error: updateErr } = await admin
    .from('faelle')
    .update({
      sv_briefing_struktur: { ...briefing, generated_by: generatedBy },
      updated_at: generatedAtIso,
    })
    .eq('id', fallId)

  if (updateErr) {
    return {
      success: false,
      error: `DB-Update fehlgeschlagen: ${updateErr.message}`,
    }
  }

  // Usage loggen (non-blocking, nur wenn echte AI-Nutzung)
  if (usageForLog && generatedBy === 'ai') {
    void logAiUsage({
      endpoint: 'sv_briefing_struktur',
      model: BRIEFING_MODEL,
      fallId,
      usage: usageForLog,
    })
  }

  return { success: true, briefing, generated_by: generatedBy }
}
