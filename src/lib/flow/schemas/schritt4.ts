import { z } from 'zod'

// AAR-476 C10: Schema für Schritt 4 — Signup + Consent.
// Password-Policy: min 8 Zeichen, mindestens 1 Ziffer, mindestens 1 Buchstabe.
// AGB + Datenschutz müssen aktiv angehakt sein (literal(true)).
// consent_vollzugriff: default false — Stufe-2 muss aktiv opt-in.

export const schritt4Schema = z
  .object({
    email: z.string().email('Gültige Email erforderlich'),
    password: z
      .string()
      .min(8, 'Mindestens 8 Zeichen')
      .regex(/[0-9]/, 'Mindestens eine Ziffer')
      .regex(/[a-zA-Z]/, 'Mindestens einen Buchstaben'),
    password_confirm: z.string(),
    agb_accepted: z.literal(true, { message: 'AGB müssen akzeptiert werden' }),
    datenschutz_accepted: z.literal(true, {
      message: 'Datenschutz muss akzeptiert werden',
    }),
    consent_vollzugriff: z.boolean(),
  })
  .refine((d) => d.password === d.password_confirm, {
    path: ['password_confirm'],
    message: 'Passwörter stimmen nicht überein',
  })

export type Schritt4FormValues = z.infer<typeof schritt4Schema>
