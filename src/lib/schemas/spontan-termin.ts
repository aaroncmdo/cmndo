// AAR-1480 (Lead-Audit P1-2): Zentrales Zod-Schema fuer createSpontanTermin.
// Vorher: nur Inline-Checks (vorname/nachname/telefon trim).
//
// Wichtig: svId muss UUID sein, startIso ISO-8601 mit Offset, durationMin
// positiv und sinnvoll begrenzt (max 8h fuer einen Spontan-Termin).

import { z } from 'zod'

export const SpontanTerminSchema = z.object({
  vorname: z.string().min(1).max(100),
  nachname: z.string().min(1).max(100),
  telefon: z.string().min(1).max(50),
  email: z.string().max(200).nullable(),
  besichtigungsortAdresse: z.string().max(500),
  besichtigungsortLat: z.number().min(-90).max(90).nullable(),
  besichtigungsortLng: z.number().min(-180).max(180).nullable(),
  svId: z.string().uuid('svId muss eine UUID sein'),
  startIso: z.string().datetime({ offset: true, message: 'startIso muss ISO-8601 mit Offset sein' }),
  durationMin: z.number().int().positive().max(480, 'durationMin darf max 480min (8h) sein'),
  flowlinkKanal: z.enum(['whatsapp', 'sms', 'email', 'kein']),
})

export type SpontanTerminInput = z.infer<typeof SpontanTerminSchema>
