import { z } from 'zod'

// AAR-472 C6: Zod-Schema für das Vision-Ergebnis, das Claude für die Schadens-
// fotos des Kunden liefert. Landet als JSONB in `leads.claude_vision_analyse`
// und wird in AAR-473 (C7) für den DAT-Call und die Ergebnis-Ansicht genutzt.

export const schadentypEnum = z.enum([
  'auffahrunfall',
  'spurwechsel',
  'vorfahrtsverletzung',
  'parkplatz',
  'hagel',
  'wildunfall',
  'vandalismus',
  'sonstiges',
])

export const schweregradEnum = z.enum(['leicht', 'mittel', 'schwer'])

export const visionResultSchema = z.object({
  beschaedigte_teile: z.array(z.string().min(1).max(80)).max(20),
  schweregrad: schweregradEnum,
  schadentyp_vermutet: schadentypEnum.nullable(),
  fahrzeug_hinweise: z
    .object({
      hersteller: z.string().max(60).nullable(),
      modell: z.string().max(60).nullable(),
      farbe: z.string().max(40).nullable(),
      kennzeichen: z.string().max(20).nullable(),
    })
    .partial()
    .nullable(),
  zusammenfassung: z.string().min(10).max(800),
  confidence: z.number().min(0).max(1),
})

export type VisionResult = z.infer<typeof visionResultSchema>
