// AAR-1480 (Lead-Audit P1-2): Zentrales Zod-Schema fuer Aircall-Inbound-Webhook.
// Vorher: nur HMAC + JSON.parse, danach untyped Property-Access auf event.data.*.
//
// Aircall-Schema bleibt extensible (.passthrough() auf data) damit wir bei
// neuen Aircall-Feldern nicht sofort 400en. Pflicht ist nur `event` + `data.id`.

import { z } from 'zod'

export const AircallCallDataSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    direction: z.string().optional(),
    started_at: z.number().optional(),
    answered_at: z.number().optional(),
    ended_at: z.number().optional(),
    duration: z.number().optional(),
    raw_digits: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    user: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        email: z.string().optional(),
      })
      .passthrough()
      .optional(),
    recording: z.string().optional(),
    voicemail: z.string().optional(),
    comments: z.array(z.object({ content: z.string() }).passthrough()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough()

export const AircallEventSchema = z.object({
  event: z.string().min(1, 'event muss gesetzt sein'),
  data: AircallCallDataSchema,
})

export type AircallEvent = z.infer<typeof AircallEventSchema>
export type AircallCallData = z.infer<typeof AircallCallDataSchema>
