// AAR-377: Generator für das SV-Briefing.
//
// `generateSvBriefing(fallId)` ist die zentrale Einstiegsfunktion:
//   - Lädt Fall + Lead per Admin-Client (RLS-frei, wird nie clientseitig
//     aufgerufen).
//   - Mapped auf strukturierten BriefingInput.
//   - Ruft Anthropic Messages-API mit Sonnet 4.6, max 300 Output-Tokens.
//   - Schreibt `faelle.sv_briefing_*` und schreibt Timeline-Eintrag.
//   - Inkrementiert `sv_briefing_version`.
//
// Fehler werden via Return-Shape signalisiert (kein throw nach außen) —
// der Caller (Lead→Fall-Convert, Regenerate-Action) darf den Fehler tolerieren
// bzw. dem User anzeigen.
//
// Usage wird via logAiUsage (AAR-436) geloggt.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import {
  buildBriefingInput,
  buildSvBriefingSystem,
  buildSvBriefingUser,
} from '@/lib/ai/briefing-prompt'

const BRIEFING_MODEL = AI_MODELS.sv_briefing
const MAX_OUTPUT_TOKENS = 300
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

export type GenerateSvBriefingResult = {
  success: boolean
  briefing?: string
  model?: string
  version?: number
  cached?: boolean
  error?: string
}

export type GenerateSvBriefingOptions = {
  /**
   * Wenn true, wird das Briefing neu generiert, auch wenn ein aktuelles
   * (<24h) bereits in der DB liegt. Für den Regenerate-Button.
   */
  force?: boolean
}

export async function generateSvBriefing(
  fallId: string,
  options: GenerateSvBriefingOptions = {},
): Promise<GenerateSvBriefingResult> {
  const admin = createAdminClient()

  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .select('*')
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) {
    return { success: false, error: `Fall nicht gefunden: ${fallErr?.message ?? 'unbekannt'}` }
  }

  // Cache-Pfad: weniger als 24h alt → bestehenden Text zurückgeben.
  const fallRow = fall as Record<string, unknown>
  if (!options.force && fallRow.sv_briefing_text && fallRow.sv_briefing_generated_at) {
    const generatedAt = new Date(fallRow.sv_briefing_generated_at as string).getTime()
    if (Number.isFinite(generatedAt) && Date.now() - generatedAt < CACHE_WINDOW_MS) {
      return {
        success: true,
        briefing: fallRow.sv_briefing_text as string,
        model: (fallRow.sv_briefing_model as string | null) ?? BRIEFING_MODEL,
        version: (fallRow.sv_briefing_version as number | null) ?? 1,
        cached: true,
      }
    }
  }

  // Lead laden (falls vorhanden) — Lead-Felder liefern Fallback für Dinge
  // die im Fall leer sind.
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
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  }

  const anthropic = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 3 })

  let briefingText: string
  let usageForLog: Anthropic.Usage | null = null
  try {
    const response = await anthropic.messages.create({
      model: BRIEFING_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: buildSvBriefingSystem(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildSvBriefingUser(input) }],
    })

    const firstBlock = response.content[0]
    briefingText =
      firstBlock && firstBlock.type === 'text'
        ? firstBlock.text.trim()
        : ''
    usageForLog = response.usage
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude-API-Fehler'
    console.error('[AAR-377] Briefing-Generierung fehlgeschlagen:', err)
    return { success: false, error: msg }
  }

  if (!briefingText) {
    return { success: false, error: 'Claude hat keinen Text zurückgegeben' }
  }

  // Version hochzählen (startet bei 1 — DB-Default ist 0).
  const prevVersion = (fallRow.sv_briefing_version as number | null) ?? 0
  const nextVersion = prevVersion + 1
  const generatedAtIso = new Date().toISOString()

  const { error: updateErr } = await admin
    .from('faelle')
    .update({
      sv_briefing_text: briefingText,
      sv_briefing_generated_at: generatedAtIso,
      sv_briefing_model: BRIEFING_MODEL,
      sv_briefing_version: nextVersion,
      updated_at: generatedAtIso,
    })
    .eq('id', fallId)

  if (updateErr) {
    console.error('[AAR-377] Briefing-Update fehlgeschlagen:', updateErr.message)
    return { success: false, error: `DB-Update fehlgeschlagen: ${updateErr.message}` }
  }

  // Timeline-Eintrag (non-blocking).
  try {
    await admin.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: options.force || prevVersion > 0 ? 'Briefing neu generiert' : 'Briefing generiert',
      beschreibung: `SV-Briefing v${nextVersion} mit ${BRIEFING_MODEL}`,
    })
  } catch (err) {
    console.error('[AAR-377] Timeline-Insert fehlgeschlagen:', err)
  }

  // Usage loggen (non-blocking, fire-and-forget).
  if (usageForLog) {
    void logAiUsage({
      endpoint: 'sv_briefing',
      model: BRIEFING_MODEL,
      fallId,
      usage: usageForLog,
    })
  }

  return {
    success: true,
    briefing: briefingText,
    model: BRIEFING_MODEL,
    version: nextVersion,
    cached: false,
  }
}
