import { z } from 'zod'

// AAR-470 C4: Zod-Schema für Claude-Extraktion aus dem Voice-Transkript.
// Alle Felder außer schadenhergang sind nullable — Claude soll nicht raten.
// Die Feld-Namen sind absichtlich gleich wie in schritt1.ts damit das Prefill
// 1:1 in die Form gefüttert werden kann.

export const SCHADENTYP_VOICE_VALUES = [
  'auffahrunfall',
  'kreuzung',
  'spurwechsel',
  'parkschaden',
  'wildunfall',
  'sonstiges',
] as const

export const SCHULDFRAGE_VOICE_VALUES = [
  'gegner',
  'geteilt',
  'selbst',
  'unklar',
] as const

export const voiceExtractionSchema = z.object({
  schadenhergang: z.string().max(2000),
  unfall_datum: z.string().nullable(),
  unfall_ort: z.string().max(200).nullable(),
  schuldfrage: z.enum(SCHULDFRAGE_VOICE_VALUES).nullable(),
  schadentyp: z.enum(SCHADENTYP_VOICE_VALUES).nullable(),
  polizei_vor_ort: z.boolean().nullable(),
  polizei_aktenzeichen: z.string().max(50).nullable(),
})

export type VoiceExtraction = z.infer<typeof voiceExtractionSchema>
