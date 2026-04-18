import { z } from 'zod'

// AAR-475 C9: Zod-Schema für den ZB1-Preview und das manuelle Fallback-Form.
// Gleiches Shape — egal ob nach OCR korrigiert oder ohne Scan eingetippt.

export const zb1Schema = z.object({
  hsn: z.string().regex(/^[0-9]{4}$/, 'HSN muss 4 Ziffern haben'),
  tsn: z.string().regex(/^[A-Z0-9]{3}$/i, 'TSN muss 3 Zeichen haben'),
  fin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'FIN muss 17 Zeichen haben (kein I/O/Q)'),
  erstzulassung: z
    .string()
    .regex(
      /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/,
      'Erstzulassung: TT.MM.JJJJ oder JJJJ-MM-TT',
    ),
  kennzeichen: z.string().max(20).optional().or(z.literal('')),
})

export type Zb1FormValues = z.infer<typeof zb1Schema>
