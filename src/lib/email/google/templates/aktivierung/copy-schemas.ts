import { z } from 'zod'

const block = z.object({ titel: z.string(), text: z.string() })

export const copySchemas = {
  willkommen: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), so_laeufts: z.array(z.string()).min(1), cta_label: z.string() }),
  nutzen: z.object({ headline: z.string(), bloecke: z.array(block).length(4), schluss: z.string(), cta_label: z.string() }),
  sv_vorstellung: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), cta_label: z.string() }),
  kundenstory: z.object({ headline: z.string(), intro: z.string(), zitat: z.string(), schluss: z.array(z.string()).min(1), cta_label: z.string() }),
  bonus: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), cta_label: z.string(), fussnote: z.string() }),
  reaktivierung: z.object({ headline: z.string(), intro: z.string(), punkte: z.array(z.string()).length(3), schluss: z.string(), cta_label: z.string() }),
} as const

export type CopyFor<K extends keyof typeof copySchemas> = z.infer<(typeof copySchemas)[K]>
