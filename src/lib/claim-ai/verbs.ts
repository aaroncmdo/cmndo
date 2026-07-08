// Verb-Registry der Claim-AI-Konsole. Spiegelt src/lib/orchestrator/tools.ts,
// aber fuer den interaktiven Copilot + Aktions-Verben. KEIN 'use server'.
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'

const ROLLEN = ['sachverstaendiger', 'kundenbetreuer', 'admin'] as const
const PRIOS = ['niedrig', 'normal', 'hoch'] as const
const KANAELE = ['email', 'sms', 'whatsapp'] as const

export type ClaimAiVorschlagTyp = 'task' | 'draft_message' | 'add_note'
export type ClaimAiDraft = {
  vorschlagTyp: ClaimAiVorschlagTyp
  zielRolle: (typeof ROLLEN)[number] | null
  payload: Record<string, unknown>
  begruendung: string
}

export const VERB_KIND: Record<ClaimAiVorschlagTyp, 'task' | 'auto' | 'draft'> = {
  task: 'task',
  add_note: 'auto',
  draft_message: 'draft',
}

const proposeTask = z.object({
  ziel_rolle: z.enum(ROLLEN),
  titel: z.string().min(3),
  beschreibung: z.string().optional(),
  prioritaet: z.enum(PRIOS).optional(),
  faellig_in_tagen: z.number().int().min(0).max(30).optional(),
  begruendung: z.string().min(3),
})
const proposeDraftMessage = z.object({
  kanal: z.enum(KANAELE),
  text: z.string().min(10),
  begruendung: z.string().min(3),
})
const proposeAddNote = z.object({
  titel: z.string().min(3),
  text: z.string().min(3),
  begruendung: z.string().min(3),
})

export const CLAIM_AI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_task',
    description: 'Schlage einen konkreten Task fuer eine interne Rolle vor (wird NICHT automatisch angelegt — Admin gibt frei).',
    input_schema: {
      type: 'object',
      properties: {
        ziel_rolle: { type: 'string', enum: [...ROLLEN] },
        titel: { type: 'string' },
        beschreibung: { type: 'string' },
        prioritaet: { type: 'string', enum: [...PRIOS] },
        faellig_in_tagen: { type: 'integer', minimum: 0, maximum: 30 },
        begruendung: { type: 'string' },
      },
      required: ['ziel_rolle', 'titel', 'begruendung'],
    },
  },
  {
    name: 'propose_draft_message',
    description: 'Entwirf eine Nachricht an den Kunden/Gegner (wird NICHT gesendet — Admin gibt frei, dann bewusster Sende-Klick).',
    input_schema: {
      type: 'object',
      properties: {
        kanal: { type: 'string', enum: [...KANAELE] },
        text: { type: 'string' },
        begruendung: { type: 'string' },
      },
      required: ['kanal', 'text', 'begruendung'],
    },
  },
  {
    name: 'propose_add_note',
    description: 'Schlage eine interne Timeline-Notiz vor (z.B. erkannter Widerspruch/Hinweis).',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        text: { type: 'string' },
        begruendung: { type: 'string' },
      },
      required: ['titel', 'text', 'begruendung'],
    },
  },
]

export function validateClaimAiToolCall(
  name: string,
  input: unknown,
): { ok: true; draft: ClaimAiDraft } | { ok: false; error: string } {
  if (name === 'propose_task') {
    const p = proposeTask.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    const { ziel_rolle, begruendung, ...rest } = p.data
    return { ok: true, draft: { vorschlagTyp: 'task', zielRolle: ziel_rolle, payload: rest, begruendung } }
  }
  if (name === 'propose_draft_message') {
    const p = proposeDraftMessage.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'draft_message', zielRolle: null, payload: { kanal: p.data.kanal, text: p.data.text }, begruendung: p.data.begruendung } }
  }
  if (name === 'propose_add_note') {
    const p = proposeAddNote.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'add_note', zielRolle: null, payload: { titel: p.data.titel, text: p.data.text }, begruendung: p.data.begruendung } }
  }
  return { ok: false, error: `unbekanntes Tool: ${name}` }
}

export function extractClaimAiDrafts(content: Anthropic.ContentBlock[]): ClaimAiDraft[] {
  const out: ClaimAiDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateClaimAiToolCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}
