import { z } from 'zod'
import type { ProposalDraft } from './types'
import { type VerbDefinition, toolsFrom, validateVerb } from '@/lib/claim-ai/engine/verbs'

const ROLLEN = ['sachverstaendiger', 'kundenbetreuer', 'admin'] as const
const PRIOS = ['niedrig', 'normal', 'hoch'] as const

const proposeTask = z.object({
  ziel_rolle: z.enum(ROLLEN),
  titel: z.string().min(3),
  beschreibung: z.string().optional(),
  prioritaet: z.enum(PRIOS).optional(),
  faellig_in_tagen: z.number().int().min(0).max(30).optional(),
  begruendung: z.string().min(3),
})
const flagEscalation = z.object({
  ziel_rolle: z.enum(ROLLEN),
  grund: z.string().min(3),
  begruendung: z.string().min(3),
})
const suggestNextStep = z.object({
  hinweis: z.string().min(3),
  begruendung: z.string().min(3),
})

// SP2-Konvergenz P1b: die Orchestrator-Verben in der geteilten VerbDefinition-
// Struktur. Aufsicht/Konsole definieren ihre Verben mit derselben Struktur und
// wählen ihr Subset. Externe API (ORCHESTRATOR_TOOLS/validateToolCall) unverändert.
export const ORCHESTRATOR_VERBS: VerbDefinition<ProposalDraft>[] = [
  {
    name: 'propose_task',
    tool: {
      name: 'propose_task',
      description: 'Schlage einen konkreten Task für eine interne Rolle vor (wird NICHT automatisch angelegt, ein Mensch entscheidet).',
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
    validate: (input) => {
      const p = proposeTask.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      const { ziel_rolle, begruendung, ...rest } = p.data
      return { ok: true, draft: { vorschlagTyp: 'task', zielRolle: ziel_rolle, payload: rest, begruendung } }
    },
  },
  {
    name: 'flag_escalation',
    tool: {
      name: 'flag_escalation',
      description: 'Nur für einen HARTEN, blockierenden Zustand, den eine Rolle SOFORT auflösen muss (z. B. verletzter SLA mit konkretem Owner). Kein Status-Bericht, keine Analyse. `grund` = die konkrete Sofort-Aktion, nicht die Beschreibung. Im Zweifel propose_task statt Eskalation.',
      input_schema: {
        type: 'object',
        properties: {
          ziel_rolle: { type: 'string', enum: [...ROLLEN] },
          grund: { type: 'string' },
          begruendung: { type: 'string' },
        },
        required: ['ziel_rolle', 'grund', 'begruendung'],
      },
    },
    validate: (input) => {
      const p = flagEscalation.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: { vorschlagTyp: 'escalation', zielRolle: p.data.ziel_rolle, payload: { grund: p.data.grund }, begruendung: p.data.begruendung } }
    },
  },
  {
    name: 'suggest_next_step',
    tool: {
      name: 'suggest_next_step',
      description: 'Formuliere einen unverbindlichen nächsten Schritt (ohne Rollen-Zuordnung).',
      input_schema: {
        type: 'object',
        properties: { hinweis: { type: 'string' }, begruendung: { type: 'string' } },
        required: ['hinweis', 'begruendung'],
      },
    },
    validate: (input) => {
      const p = suggestNextStep.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: { vorschlagTyp: 'next_step', zielRolle: null, payload: { hinweis: p.data.hinweis }, begruendung: p.data.begruendung } }
    },
  },
]

export const ORCHESTRATOR_TOOLS = toolsFrom(ORCHESTRATOR_VERBS)

export function validateToolCall(
  name: string,
  input: unknown,
): { ok: true; draft: ProposalDraft } | { ok: false; error: string } {
  return validateVerb(ORCHESTRATOR_VERBS, name, input)
}
