import { z } from 'zod'

/**
 * Zod-Schema fuer den Claude-Output (Skript + Visual-Plan) des Marketing-Content-Studios.
 * Spiegelt das Tool-Schema aus dem validierten PoC (scripts/marketing-poc/lib/script.mjs)
 * und Spec §7. Consumer: generiereSkript (Server-Action) validiert damit den Claude-Output.
 */

export const SegmentVisualSchema = z.object({
  typ: z.enum(['marke', 'stock', 'grafik']),
  tags: z.array(z.string()).optional(),
  queries: z.array(z.string()).optional(),
})

export const ContentSegmentSchema = z.object({
  text: z.string().min(1),
  on_screen_text: z.string().optional(),
  visual: SegmentVisualSchema,
})

export const ContentScriptSchema = z.object({
  hook: z.string().min(1),
  segmente: z.array(ContentSegmentSchema).min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string()),
  disclaimer: z.string().optional(),
})

export type SegmentVisual = z.infer<typeof SegmentVisualSchema>
export type ContentSegment = z.infer<typeof ContentSegmentSchema>
export type ContentScript = z.infer<typeof ContentScriptSchema>

export type ContentFormat = 'ratgeber' | 'ad'
