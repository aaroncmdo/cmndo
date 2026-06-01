import { z } from 'zod'

// AAR-902 Prototyp: Mini-Wizard Zod-Schema. Vier Felder + DSGVO-Consent.
// Schritt-1 des kommenden Lean-Flows. Volle Spec:
// docs/14.05.2026/mini-wizard-magic-link-konzept.md

export const miniWizardSchema = z.object({
  schuldfrage: z.enum(['gegner', 'unklar', 'eigenverantwortung']),
  unfalldatum: z
    .string()
    .min(1, 'Unfalldatum ist erforderlich')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Ungültiges Datum'),
  unfallort: z.string().trim().min(3, 'Unfallort ist zu kurz').max(200),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  telefon: z
    .string()
    .trim()
    .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format'),
  vorname: z.string().trim().min(1, 'Vorname ist erforderlich').max(50),
  nachname: z.string().trim().min(1, 'Nachname ist erforderlich').max(50),
  dsgvo_consent: z.literal(true, {
    error: 'DSGVO-Einwilligung ist erforderlich',
  }),
  // 15.05.2026: Promo-Code direkt im FormData transportiert (Cookie-Mechanismus
  // entfernt — cookies().set() im Server-Component-Render-Pfad crasht in
  // Next 16+, weder PR #1308 noch #1319 konnten alle drei Crash-Quellen
  // dauerhaft schließen). Validator deckungsgleich mit isValidPromoCodeFormat:
  // MK- + 4 alphanumerische Zeichen. Optional — Wizard funktioniert auch ohne
  // Promo (Direct-Lead ohne Makler-Attribution).
  promoCode: z
    .union([z.literal(''), z.string().regex(/^MK-[A-Z0-9]{4}$/, 'Ungültiges Promo-Code-Format')])
    .optional(),
})

export type MiniWizardInput = z.infer<typeof miniWizardSchema>
