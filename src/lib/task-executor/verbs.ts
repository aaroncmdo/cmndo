// src/lib/task-executor/verbs.ts
import { z } from 'zod'
import { validateVerb } from '@/lib/claim-ai/engine/verbs'
import { FALL_STATUS_TRANSITIONS } from '@/lib/faelle/state-machine'
import { ERLAUBTE_COMM_TRIGGER } from './allowed-triggers'
import { applyInterneNotiz, applyTaskSchliessen, applySendeKommunikation, applySetzeStatus } from './apply'
import type { ActionVerb, ActionDraft } from './types'

const ALLE_STATUS = Object.keys(FALL_STATUS_TRANSITIONS)

const notizSchema = z.object({ text: z.string().min(3), begruendung: z.string().optional() })
const schliessenSchema = z.object({ ergebnis: z.string().min(3), begruendung: z.string().optional() })
const kommSchema = z.object({
  trigger: z.enum(ERLAUBTE_COMM_TRIGGER),
  variablen: z.record(z.string(), z.string()).default({}),
  begruendung: z.string().optional(),
})
const statusSchema = z.object({
  neuer_status: z.enum(ALLE_STATUS as [string, ...string[]]),
  grund: z.string().min(3),
  begruendung: z.string().optional(),
})

function draft(verb: string, args: Record<string, unknown>, begruendung?: string): ActionDraft {
  return { verb, args, begruendung }
}

export const EXECUTOR_VERBS: ActionVerb[] = [
  {
    name: 'interne_notiz',
    risk: 'safe',
    tool: {
      name: 'interne_notiz',
      description: 'Schreibe eine interne Notiz an den Fall (nur fuer Mitarbeiter sichtbar, kein Outbound).',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string' }, begruendung: { type: 'string' } },
        required: ['text'],
      },
    },
    validate: (input) => {
      const p = notizSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('interne_notiz', { text: p.data.text }, p.data.begruendung) }
    },
    apply: applyInterneNotiz,
  },
  {
    name: 'task_schliessen',
    risk: 'safe',
    tool: {
      name: 'task_schliessen',
      description: 'Markiere die Aufgabe als erledigt. Nutze dies als LETZTE Aktion, wenn die Aufgabe abgeschlossen ist.',
      input_schema: {
        type: 'object',
        properties: { ergebnis: { type: 'string' }, begruendung: { type: 'string' } },
        required: ['ergebnis'],
      },
    },
    validate: (input) => {
      const p = schliessenSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('task_schliessen', { ergebnis: p.data.ergebnis }, p.data.begruendung) }
    },
    apply: applyTaskSchliessen,
  },
  {
    name: 'sende_kommunikation',
    risk: 'consequential',
    tool: {
      name: 'sende_kommunikation',
      description:
        'Sende eine vordefinierte Nachricht (WhatsApp/Email-Template) an den Empfaenger des Falls. Waehle einen erlaubten Trigger und fuelle dessen Variablen. KEIN Freitext.',
      input_schema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', enum: [...ERLAUBTE_COMM_TRIGGER] },
          variablen: { type: 'object', additionalProperties: { type: 'string' } },
          begruendung: { type: 'string' },
        },
        required: ['trigger'],
      },
    },
    validate: (input) => {
      const p = kommSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('sende_kommunikation', { trigger: p.data.trigger, variablen: p.data.variablen }, p.data.begruendung) }
    },
    apply: applySendeKommunikation,
  },
  {
    name: 'setze_status',
    risk: 'consequential',
    tool: {
      name: 'setze_status',
      description: 'Setze den Fall-Status neu (z.B. sv-gesucht). Nur bei klarer Notwendigkeit aus dem Kontext.',
      input_schema: {
        type: 'object',
        properties: {
          neuer_status: { type: 'string', enum: ALLE_STATUS },
          grund: { type: 'string' },
          begruendung: { type: 'string' },
        },
        required: ['neuer_status', 'grund'],
      },
    },
    validate: (input) => {
      const p = statusSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('setze_status', { neuer_status: p.data.neuer_status, grund: p.data.grund }, p.data.begruendung) }
    },
    apply: applySetzeStatus,
  },
]

export function validateActionCall(name: string, input: unknown) {
  return validateVerb(EXECUTOR_VERBS, name, input)
}
