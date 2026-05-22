// Zentrales Zod-Schema fuer den matelso-Inbound-Webhook.
// Muster wie aircall-event.ts: .passthrough() damit neue matelso-Felder
// nicht sofort 400en. Alle Felder optional — auch anrufer_nummer, weil
// unterdrueckte Nummern akzeptiert werden (Call-Record ohne Lead).
// dauer_sekunden kommt von matelso als String ("120"), daher union.

import { z } from 'zod'

export const MatelsoEventSchema = z
  .object({
    call_id: z.string().optional(),
    anrufer_nummer: z.string().optional(),
    angerufene_nummer: z.string().optional(),
    anruf_status: z.string().optional(),
    dauer_sekunden: z.union([z.string(), z.number()]).optional(),
    quelle: z.string().optional(),
    zeitpunkt: z.string().optional(),
  })
  .passthrough()

export type MatelsoEvent = z.infer<typeof MatelsoEventSchema>
