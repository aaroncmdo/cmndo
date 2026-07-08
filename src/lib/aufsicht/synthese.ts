// KI-Aufsicht — Claude-Synthese.
// Ruft Claude per Batch-Tool-Use auf (spiegelt orchestrator/run.ts reviewClaim),
// extrahiert propose_sla_task-Drafts und persistiert sie in ai_claim_proposals
// mit quelle='aufsicht'. Wirft nie — alle Fehler werden intern gefangen.
// KEIN 'use server' — diese Datei exportiert Consts/Functions/Types.

import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { summarizeSlaRollenLage } from '@/lib/aufsicht/sla-rollen'
import type { SlaRollenLage } from '@/lib/aufsicht/sla-rollen'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type AufsichtDraft = {
  claimId: string
  zielRolle: 'dispatch' | 'sachverstaendiger' | 'kanzlei' | 'admin'
  titel: string
  begruendung: string
  prioritaet: 'normal' | 'dringend' | 'kritisch'
}

// ---------------------------------------------------------------------------
// Zod-Schema fuer propose_sla_task-Tool-Input
// ---------------------------------------------------------------------------

const AUFSICHT_ROLLEN = ['dispatch', 'sachverstaendiger', 'kanzlei', 'admin'] as const
const AUFSICHT_PRIOS = ['normal', 'dringend', 'kritisch'] as const

const proposeSlaTaskSchema = z.object({
  claim_id: z.string().min(1),
  ziel_rolle: z.enum(AUFSICHT_ROLLEN),
  titel: z.string().min(1),
  begruendung: z.string().min(1),
  prioritaet: z.enum(AUFSICHT_PRIOS).optional().default('normal'),
})

// ---------------------------------------------------------------------------
// Tool-Definitionen (Anthropic.Tool[])
// ---------------------------------------------------------------------------

export const AUFSICHT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_sla_task',
    description:
      'Schlage einen konkreten Task an die haengende Rolle vor, um eine SLA-Verletzung zu beheben. Wird NICHT automatisch ausgefuehrt — ein Mensch gibt frei.',
    input_schema: {
      type: 'object',
      properties: {
        claim_id: { type: 'string', description: 'Die UUID des betroffenen Claims.' },
        ziel_rolle: {
          type: 'string',
          enum: [...AUFSICHT_ROLLEN],
          description: 'Interne Rolle, an die der Task gerichtet wird.',
        },
        titel: { type: 'string', description: 'Kurzer Titel des Tasks (max. 100 Zeichen).' },
        begruendung: {
          type: 'string',
          description: 'Faktenbasierte Begruendung aus dem SLA-Kontext.',
        },
        prioritaet: {
          type: 'string',
          enum: [...AUFSICHT_PRIOS],
          description: 'Dringlichkeit: normal | dringend | kritisch.',
        },
      },
      required: ['claim_id', 'ziel_rolle', 'titel', 'begruendung'],
    },
  },
]

// ---------------------------------------------------------------------------
// System-Prompt
// ---------------------------------------------------------------------------

const AUFSICHT_SYSTEM = `Du bist Ops-Aufsicht bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird die aktuelle SLA-Lage ueber alle internen Rollen (Dispatch, Sachverstaendiger, Kanzlei, Admin) gezeigt.
Priorisiere die Lage: Welche Claims brauchen sofortige Intervention?
Schlage 0 bis N konkrete Tasks an die haengende Rolle vor (nur die kritischsten — keine Routineaufgaben).
Begruende faktenbasiert aus den gezeigten Zahlen (Claim-Nummer, SLA-Typ, Stunden ueberfaellig).
Deine Vorschlaege werden NICHT automatisch ausgefuehrt — ein Mensch gibt jeden Task frei.
Mache KEINEN Vorschlag, wenn die SLA-Lage keine konkrete Intervention erfordert.`

// ---------------------------------------------------------------------------
// extractAufsichtDrafts — pure Funktion (spiegelt extractProposalsFromToolUse)
// ---------------------------------------------------------------------------

export function extractAufsichtDrafts(content: Anthropic.ContentBlock[]): AufsichtDraft[] {
  const out: AufsichtDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    if (block.name !== 'propose_sla_task') continue
    const parsed = proposeSlaTaskSchema.safeParse(block.input)
    if (!parsed.success) {
      console.warn('[ki_aufsicht] propose_sla_task invalide Input:', parsed.error.issues[0]?.message)
      continue
    }
    const { claim_id, ziel_rolle, titel, begruendung, prioritaet } = parsed.data
    out.push({ claimId: claim_id, zielRolle: ziel_rolle, titel, begruendung, prioritaet })
  }
  return out
}

// ---------------------------------------------------------------------------
// persistAufsichtRemediation — spiegelt persistProposals + quelle='aufsicht'
// ---------------------------------------------------------------------------

/**
 * Dedupe-Key: sha256(claim_id + titel + randomUUID) — zufaelliger UUID-Anteil
 * stellt sicher, dass wiederholte Laeufe fuer den gleichen Claim neue Vorschlaege
 * anlegen koennen (anders als der Orchestrator, der content-hash-basiert deduped).
 * Der ai_claim_proposals Partial-Unique-Index dedupliziert ggf. weiter.
 */
function buildDedupeKey(claimId: string, titel: string): string {
  const raw = `${claimId}:${titel}:${randomUUID()}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export async function persistAufsichtRemediation(
  modell: string,
  drafts: AufsichtDraft[],
): Promise<string[]> {
  if (!drafts.length) return []
  const db = createAdminClient()
  const ids: string[] = []

  for (const draft of drafts) {
    const dedupeKey = buildDedupeKey(draft.claimId, draft.titel)
    const { error } = await db.from('ai_claim_proposals').insert({
      claim_id: draft.claimId,
      vorschlag_typ: 'task',
      ziel_rolle: draft.zielRolle,
      payload: {
        titel: draft.titel,
        beschreibung: draft.begruendung,
        prioritaet: draft.prioritaet,
      },
      begruendung: draft.begruendung,
      modell,
      dedupe_key: dedupeKey,
      quelle: 'aufsicht',
    })

    if (!error) {
      ids.push(dedupeKey)
    } else if (error.code !== '23505' && !error.message.includes('duplicate key')) {
      // Dedup-Kollision (23505) wird still uebersprungen; andere Fehler loggen.
      console.error('[ki_aufsicht] persist failed:', error.message)
    }
  }

  return ids
}

// ---------------------------------------------------------------------------
// laufeSlaAufsicht — Batch-Claude-Call (spiegelt reviewClaim)
// ---------------------------------------------------------------------------

/**
 * Fuehrt den SLA-Aufsichts-Batch-Call gegen Claude durch.
 * Extrahiert + persistiert Remediation-Drafts.
 * Loggt Usage (non-critical).
 * Wirft nie — gibt { findings: 0 } bei jedem Fehler zurueck.
 */
export async function laufeSlaAufsicht(lage: SlaRollenLage): Promise<{ findings: number }> {
  const model = AI_MODELS.ki_aufsicht
  let res: Anthropic.Message

  try {
    // Konstruktor im try: fehlt ANTHROPIC_API_KEY, wirft er — dann sauber 0.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    res = await client.messages.create({
      model,
      max_tokens: 1500,
      system: AUFSICHT_SYSTEM,
      tools: AUFSICHT_TOOLS,
      messages: [{ role: 'user', content: summarizeSlaRollenLage(lage) }],
    })
  } catch (err) {
    console.error('[ki_aufsicht] Anthropic-Call fehlgeschlagen:', err)
    return { findings: 0 }
  }

  // Usage-Log: non-critical, darf nie den Haupt-Flow blockieren.
  try {
    await logAiUsage({
      endpoint: 'ki_aufsicht',
      model,
      fallId: null, // Batch-Call ohne spezifischen Fall
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    })
  } catch {
    // Bewusst swallowed — usage-log non-critical.
  }

  const drafts = extractAufsichtDrafts(res.content)
  if (!drafts.length) return { findings: 0 }

  const ids = await persistAufsichtRemediation(model, drafts)
  return { findings: ids.length }
}
